/* O'Roots — حساس مناخ الصوبة: ESP32 + SHT31 (حرارة ورطوبة) + VEML7700 (إضاءة).
   بيقرا كل دقيقة، وبيبعت المتوسط لكمبيوتر المزرعة (السيرفر المحلي) على الواي فاي كل 10 دقايق.
   الخطوات كاملة في server/README-AR.md (قسم الحساسات).

   التوصيل (الحساسين على نفس سلكين الـ I2C):
     ESP32 3V3  → VIN  في الحساسين      (أحمر)
     ESP32 GND  → GND  في الحساسين      (أسود)
     ESP32 GPIO21 → SDA في الحساسين     (أزرق)
     ESP32 GPIO22 → SCL في الحساسين     (أصفر)
   العناوين: SHT31 = 0x44 ، VEML7700 = 0x10 (مفيش تعارض).

   المكتبات (Arduino IDE ← Library Manager):
     - Adafruit SHT31 Library
     - Adafruit VEML7700 Library
   البوردة: ESP32 Dev Module (من Boards Manager: esp32 by Espressif). */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include "Adafruit_SHT31.h"
#include "Adafruit_VEML7700.h"

/* ====== غيّر دول بس ====== */
const char* WIFI_SSID = "اسم-الواي-فاي";                     // شبكة 2.4 جيجا (الـ ESP32 ما بيشوفش 5G)
const char* WIFI_PASS = "كلمة-سر-الواي-فاي";
const char* GATEWAY   = "http://192.168.1.50:8787/ingest";   // انسخه من التطبيق: الإعدادات ← الحساسات (عنوان كمبيوتر المزرعة)
const char* API_KEY   = "نفس-apiKey-اللي-في-config.json";     // قسم sensors في server\config.json
const char* DEVICE    = "lg1-climate";                       // لازم يكون مكتوب في devices في نفس القسم
/* ========================= */

const unsigned long SAMPLE_MS = 60UL * 1000UL;        // قراءة كل دقيقة
const unsigned long SEND_MS   = 10UL * 60UL * 1000UL; // إرسال المتوسط كل 10 دقايق

Adafruit_SHT31 sht = Adafruit_SHT31();
Adafruit_VEML7700 veml = Adafruit_VEML7700();
bool shtOk = false, vemlOk = false;
float sumT = 0, sumH = 0, sumL = 0; int nTH = 0, nL = 0;
unsigned long lastSample = 0, lastSend = 0, lastHeater = 0;

void wifiConnect(){
  if(WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while(WiFi.status() != WL_CONNECTED && millis() - t0 < 20000UL){ delay(500); Serial.print("."); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " WiFi OK" : " WiFi فشل — هيحاول تاني");
}

void sensorsBegin(){
  Wire.begin(21, 22);
  shtOk = sht.begin(0x44);
  vemlOk = veml.begin();
  if(vemlOk){ veml.setGain(VEML7700_GAIN_1_8); veml.setIntegrationTime(VEML7700_IT_100MS); }   // مناسب للشمس العالية
  Serial.printf("SHT31: %s | VEML7700: %s\n", shtOk ? "OK" : "مش لاقيه", vemlOk ? "OK" : "مش لاقيه");
}

void sample(){
  if(!shtOk || !vemlOk) sensorsBegin();   // لو حساس فصل بيحاول يرجّعه
  if(shtOk){
    float t = sht.readTemperature(), h = sht.readHumidity();
    if(!isnan(t) && !isnan(h) && t > -10 && t < 70 && h >= 0 && h <= 100){ sumT += t; sumH += h; nTH++; }
    // الرطوبة العالية جدًا ممكن تعمل تكثيف على الحساس: سخّنه 10 ثواني مرة كل ساعة (والقراءة بتتأجل دقيقتين)
    if(h > 95 && millis() - lastHeater > 3600000UL){ sht.heater(true); delay(10000); sht.heater(false); lastHeater = millis(); lastSample = millis() + 120000UL; }
  }
  if(vemlOk){
    float lux = veml.readLux(VEML_LUX_AUTO);   // بيظبط الحساسية لوحده (من الضلمة لحد الشمس الجامدة)
    if(!isnan(lux) && lux >= 0 && lux < 250000){ sumL += lux; nL++; }
  }
}

void sendAvg(){
  if(nTH == 0 || nL == 0){ Serial.println("مفيش قراءات كفاية للإرسال"); return; }
  wifiConnect(); if(WiFi.status() != WL_CONNECTED) return;
  float t = sumT / nTH, h = sumH / nTH, l = sumL / nL;
  String body = String("{\"device\":\"") + DEVICE + "\",\"temp\":" + String(t, 1) + ",\"rh\":" + String(h, 1) + ",\"lux\":" + String(l, 0) + "}";
  for(int attempt = 0; attempt < 3; attempt++){
    HTTPClient http; http.begin(GATEWAY); http.setTimeout(8000);
    http.addHeader("Content-Type", "application/json"); http.addHeader("x-api-key", API_KEY);
    int code = http.POST(body); http.end();
    Serial.printf("إرسال %s ← %d\n", body.c_str(), code);
    if(code >= 200 && code < 300){ sumT = sumH = sumL = 0; nTH = nL = 0; return; }
    delay(3000);
  }
  // لو فشل بيحتفظ بالمجموع ويبعته المرة الجاية (متوسط فترة أطول)
}

void setup(){
  Serial.begin(115200); delay(300);
  sensorsBegin();
  wifiConnect();
  sample(); lastSample = millis(); lastSend = millis();
}

void loop(){
  unsigned long now = millis();
  if((long)(now - lastSample) >= (long)SAMPLE_MS){ lastSample = now; sample(); }
  if(now - lastSend >= SEND_MS){ lastSend = now; sendAvg(); }
  delay(200);
}
