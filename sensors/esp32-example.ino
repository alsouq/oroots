// مثال ESP32 (Arduino): بيقرا حساس حرارة/رطوبة (DHT22) وحساس إضاءة، وبيبعتهم لبوابة الحساسات كل 10 دقايق.
// ملاحظة: ده مثال بدائي ما اتجرّبش على جهاز فعلي — عدّل الدبابيس والمكتبات حسب الحساسات اللي عندك.
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

const char* WIFI_SSID = "اسم-الواي-فاي";
const char* WIFI_PASS = "كلمة-السر";
const char* GATEWAY   = "http://192.168.1.50:8787/ingest";   // عنوان كمبيوتر المزرعة (التطبيق: الإعدادات ← الحساسات)
const char* API_KEY   = "نفس-apiKey-اللي-في-config.json";
const char* DEVICE    = "lg1-climate";                       // لازم يكون موجود في devices في قسم sensors في config.json
DHT dht(4, DHT22);                                           // DHT22 على دبوس 4

float readLux(){ return analogRead(34) * 0.9; }              // استبدلها بقراءة BH1750 مثلًا (بوحدة لوكس)

void setup(){
  Serial.begin(115200); dht.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while(WiFi.status() != WL_CONNECTED){ delay(500); }
}
void loop(){
  float t = dht.readTemperature(), h = dht.readHumidity();
  if(!isnan(t) && !isnan(h)){
    HTTPClient http; http.begin(GATEWAY);
    http.addHeader("Content-Type", "application/json"); http.addHeader("x-api-key", API_KEY);
    String body = String("{\"device\":\"") + DEVICE + "\",\"temp\":" + t + ",\"rh\":" + h + ",\"lux\":" + readLux() + "}";
    int code = http.POST(body); Serial.println(code); http.end();
  }
  delay(10UL * 60UL * 1000UL);                               // كل 10 دقايق (البوابة بتتجاهل الأسرع من كده)
}
