/*
 * ESP32-S3 + RFID RC522 + Cámara OV2640 + LCD I2C
 * - Lee tarjetas RFID y las envía a Supabase (set-scanned-uid)
 * - Cada 2s consulta si hay petición de foto pendiente (check-photo-request)
 *   y si la hay, captura y sube la imagen.
 *
 * Pines según tu hardware:
 *  LCD  I2C : SDA=1,  SCL=2
 *  RFID SPI : RST=21, SS=47, MOSI=45, MISO=38, SCK=14
 *  Cámara   : ver bloque CAMERA PINS abajo (ajustar según módulo)
 */

#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// Comenta esta línea si NO tienes cámara conectada
#define USE_CAMERA

#ifdef USE_CAMERA
#include "esp_camera.h"
#include "mbedtls/base64.h"
#endif

// ============== CONFIG ==============
const char* ssid     = "Flia_Yanez";
const char* password = "yjmo03zd";

// Supabase
const char* SUPABASE_URL    = "https://arlqnnkxcbmwwyidjykw.supabase.co";
const char* SUPABASE_ANON   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybHFubmt4Y2Jtd3d5aWRqeWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTYyNDAsImV4cCI6MjA5MDM5MjI0MH0.VgfT8oVU2CkZUamsCum669Ogr0a_Ao_dUbEdXcCJoOs";

const char* URL_SET_UID         = "https://arlqnnkxcbmwwyidjykw.supabase.co/functions/v1/set-scanned-uid";
const char* URL_CHECK_PHOTO_REQ = "https://arlqnnkxcbmwwyidjykw.supabase.co/functions/v1/check-photo-request";

// ============== LCD ==============
#define SDA_PIN 1
#define SCL_PIN 2
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ============== RFID ==============
#define RST_PIN  21
#define SS_PIN   47
#define MOSI_PIN 45
#define MISO_PIN 38
#define SCK_PIN  14
MFRC522 mfrc522(SS_PIN, RST_PIN);

// ============== CAMERA PINS (AI-Thinker estándar) ==============
// Si tu módulo es ESP32-S3-CAM Freenove / XIAO / otro, cámbialos.
#ifdef USE_CAMERA
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     15
#define SIOD_GPIO_NUM      4
#define SIOC_GPIO_NUM      5
#define Y9_GPIO_NUM       16
#define Y8_GPIO_NUM       17
#define Y7_GPIO_NUM       18
#define Y6_GPIO_NUM       12
#define Y5_GPIO_NUM       10
#define Y4_GPIO_NUM        8
#define Y3_GPIO_NUM        9
#define Y2_GPIO_NUM       11
#define VSYNC_GPIO_NUM     6
#define HREF_GPIO_NUM      7
#define PCLK_GPIO_NUM     13
#endif

unsigned long lastPhotoCheck = 0;
const unsigned long PHOTO_CHECK_INTERVAL = 2000;

// ============== HELPERS ==============
WiFiClientSecure secureClient;

void httpAddSupabaseHeaders(HTTPClient& http) {
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON);
}

// ============== ENVIAR UID ==============
void enviarUID(const String& uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Sin WiFi, no se envía UID");
    return;
  }

  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(secureClient, URL_SET_UID)) {
    Serial.println("http.begin FALLO (set-scanned-uid)");
    return;
  }
  httpAddSupabaseHeaders(http);

  String body = "{\"uid\":\"" + uid + "\"}";
  int code = http.POST(body);
  Serial.printf("POST UID -> %d\n", code);
  if (code > 0) {
    Serial.println(http.getString());
  }
  http.end();
}

// ============== CAMARA ==============
#ifdef USE_CAMERA
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 10000000;   // 10 MHz: más estable en arranque
  config.frame_size   = FRAMESIZE_VGA;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode    = CAMERA_GRAB_LATEST;
  config.fb_location  = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.jpeg_quality = 12;
  config.fb_count     = psramFound() ? 2 : 1;

  // Reintento: a veces el primer init falla por timing
  esp_err_t err = ESP_FAIL;
  for (int i = 0; i < 3; i++) {
    err = esp_camera_init(&config);
    if (err == ESP_OK) break;
    Serial.printf("Camara intento %d FALLO: 0x%x\n", i + 1, err);
    esp_camera_deinit();
    delay(500);
  }
  if (err != ESP_OK) {
    Serial.printf("Camara FALLO definitivo: 0x%x\n", err);
    return false;
  }
  Serial.println("Camara OK");
  return true;
}

bool capturarYSubir(const String& requestId) {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Capture fail");
    return false;
  }

  size_t outLen = 0;
  mbedtls_base64_encode(NULL, 0, &outLen, fb->buf, fb->len);
  unsigned char* b64 = (unsigned char*)malloc(outLen + 1);
  if (!b64) { esp_camera_fb_return(fb); return false; }
  mbedtls_base64_encode(b64, outLen, &outLen, fb->buf, fb->len);
  b64[outLen] = 0;
  esp_camera_fb_return(fb);

  String payload = String("{\"request_id\":\"") + requestId +
                   "\",\"foto\":\"data:image/jpeg;base64," + (char*)b64 + "\"}";
  free(b64);

  HTTPClient http;
  http.setTimeout(20000);
  if (!http.begin(secureClient, URL_CHECK_PHOTO_REQ)) {
    Serial.println("http.begin FALLO (upload)");
    return false;
  }
  httpAddSupabaseHeaders(http);
  int code = http.POST(payload);
  Serial.printf("Upload foto -> %d\n", code);
  http.end();
  return code >= 200 && code < 300;
}
#endif

// ============== POLL PHOTO REQUEST ==============
void checkPhotoRequest() {
#ifdef USE_CAMERA
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.setTimeout(6000);
  if (!http.begin(secureClient, URL_CHECK_PHOTO_REQ)) return;
  httpAddSupabaseHeaders(http);
  int code = http.GET();
  if (code != 200) { http.end(); return; }

  String resp = http.getString();
  http.end();

  // Buscar "id":"<uuid>" simple
  int idIdx = resp.indexOf("\"id\":\"");
  if (idIdx < 0) return;
  int start = idIdx + 6;
  int end = resp.indexOf("\"", start);
  if (end < 0) return;
  String requestId = resp.substring(start, end);
  if (requestId.length() < 10) return;

  Serial.println("Petición de foto: " + requestId);
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Tomando foto...");

  capturarYSubir(requestId);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Pase tarjeta");
  lcd.setCursor(0, 1); lcd.print(WiFi.localIP().toString());
#endif
}

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("=== SISTEMA RFID + CAMARA ===");

  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Iniciando...");

  // WiFi
  lcd.setCursor(0, 1); lcd.print("Conectando WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(ssid, password);
  int t = 0;
  while (WiFi.status() != WL_CONNECTED && t < 40) { delay(500); Serial.print("."); t++; }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nWiFi OK! IP: %s\n", WiFi.localIP().toString().c_str());
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("WiFi OK");
    lcd.setCursor(0, 1); lcd.print(WiFi.localIP().toString());
    delay(1500);
  } else {
    Serial.println("\nWiFi FALLO");
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Error WiFi");
  }

  // TLS sin verificación de cert (suficiente para Supabase en pruebas)
  secureClient.setInsecure();

  // Cámara
#ifdef USE_CAMERA
  initCamera();
#endif

  // RFID
  pinMode(SS_PIN, OUTPUT);
  digitalWrite(SS_PIN, HIGH);
  delay(100);
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  delay(100);
  mfrc522.PCD_Init();
  delay(100);

  byte version = mfrc522.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("Version reg: 0x%02X\n", version);
  if (version == 0x91 || version == 0x92) {
    mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_max);
    Serial.println("RFID OK!");
  } else {
    Serial.println("RFID ERROR");
  }

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Pase tarjeta");
  lcd.setCursor(0, 1); lcd.print(WiFi.localIP().toString());
}

// ============== LOOP ==============
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi perdido, reconectando...");
    WiFi.reconnect();
    delay(3000);
    return;
  }

  // Polling de petición de foto
  if (millis() - lastPhotoCheck > PHOTO_CHECK_INTERVAL) {
    lastPhotoCheck = millis();
    checkPhotoRequest();
  }

  // RFID
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    String uid = "";
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
      uid += String(mfrc522.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    Serial.println("UID: " + uid);

    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("UID detectado:");
    lcd.setCursor(0, 1); lcd.print(uid);

    enviarUID(uid);

    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    delay(2000);

    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Pase tarjeta");
    lcd.setCursor(0, 1); lcd.print(WiFi.localIP().toString());
  }
}
