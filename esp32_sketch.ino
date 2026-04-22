/*
 * Sistema RFID + Cámara ESP32-S3
 * - LCD I2C  (SDA=1, SCL=2, dirección 0x27)
 * - RFID MFRC522 (SS=47, RST=21, MOSI=45, MISO=38, SCK=14)
 * - Cámara OV2640
 *
 * Funciones:
 *  1. Envía UID + foto al endpoint set-scanned-uid cuando se pasa una tarjeta
 *  2. Hace polling a check-photo-request y sube foto cuando la web la solicita
 */

#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// Comenta esta línea si tu placa NO tiene cámara
#define USE_CAMERA

#ifdef USE_CAMERA
#include "esp_camera.h"

// --- PINES DE LA CÁMARA (del código original que funcionaba) ---
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     15
#define SIOD_GPIO_NUM     4
#define SIOC_GPIO_NUM     5
#define Y9_GPIO_NUM       16
#define Y8_GPIO_NUM       17
#define Y7_GPIO_NUM       18
#define Y6_GPIO_NUM       12
#define Y5_GPIO_NUM       10
#define Y4_GPIO_NUM       8
#define Y3_GPIO_NUM       9
#define Y2_GPIO_NUM       11
#define VSYNC_GPIO_NUM    6
#define HREF_GPIO_NUM     7
#define PCLK_GPIO_NUM     13
#endif

// --- RED ---
const char* ssid     = "Flia_Yanez";
const char* password = "yjmo03zd";

// --- SUPABASE ---
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybHFubmt4Y2Jtd3d5aWRqeWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTYyNDAsImV4cCI6MjA5MDM5MjI0MH0.VgfT8oVU2CkZUamsCum669Ogr0a_Ao_dUbEdXcCJoOs";

const char* URL_SET_UID     = "https://arlqnnkxcbmwwyidjykw.supabase.co/functions/v1/set-scanned-uid";
const char* URL_CHECK_PHOTO = "https://arlqnnkxcbmwwyidjykw.supabase.co/functions/v1/check-photo-request";

// --- PINES LCD ---
#define SDA_PIN 1
#define SCL_PIN 2
LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- PINES RFID ---
#define RST_PIN  21
#define SS_PIN   47
#define MOSI_PIN 45
#define MISO_PIN 38
#define SCK_PIN  14
MFRC522 mfrc522(SS_PIN, RST_PIN);

// --- FLAGS DE ESTADO ---
bool lcdOK  = false;
bool wifiOK = false;

// --- TIMERS ---
unsigned long lastPhotoCheck = 0;
const unsigned long PHOTO_CHECK_INTERVAL = 2000;

// =======================================================
//  FORWARD DECLARATIONS
// =======================================================
void enviarUID(const String& uid);
#ifdef USE_CAMERA
void initCamera();
void checkPhotoRequest();
String base64Encode(const uint8_t* data, size_t len);
#endif

// =======================================================
//  INICIALIZAR LCD
// =======================================================
void inicializarLCD() {
  Serial.println("Inicializando LCD...");
  Wire.begin(SDA_PIN, SCL_PIN);

  Serial.println("Escaneando I2C...");
  bool encontrado = false;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("Dispositivo I2C encontrado en: 0x%02X\n", addr);
      encontrado = true;
    }
  }

  if (!encontrado) {
    Serial.println("ERROR: No se encontraron dispositivos I2C");
    lcdOK = false;
    return;
  }

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Iniciando...");
  lcd.setCursor(0, 1);
  lcd.print("Sistema RFID");
  delay(1000);

  lcdOK = true;
  Serial.println("LCD OK!");
}

// =======================================================
//  SETUP
// =======================================================
void setup() {
  Serial.begin(115200);
  delay(3000);
  Serial.println("=== SISTEMA RFID + CAMARA ===");

  inicializarLCD();

  if (lcdOK) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Conectando WiFi");
    lcd.setCursor(0, 1);
    lcd.print(ssid);
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(ssid, password);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 40) {
    delay(500);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiOK = true;
    Serial.println("\nWiFi OK! IP: " + WiFi.localIP().toString());
    if (lcdOK) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("WiFi OK");
      lcd.setCursor(0, 1);
      lcd.print(WiFi.localIP().toString());
      delay(1500);
    }
  } else {
    wifiOK = false;
    Serial.println("\nWiFi FALLO");
    if (lcdOK) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Error WiFi");
      lcd.setCursor(0, 1);
      lcd.print("Sin conexion");
      delay(1500);
    }
  }

#ifdef USE_CAMERA
  initCamera();
#endif

  if (lcdOK) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Iniciando RFID");
  }

  pinMode(SS_PIN, OUTPUT);
  digitalWrite(SS_PIN, HIGH);
  delay(200);
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  delay(200);
  mfrc522.PCD_Init();
  delay(200);

  byte version = mfrc522.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("Version reg RFID: 0x%02X\n", version);

  if (version == 0x91 || version == 0x92) {
    mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_max);
    Serial.println("RFID OK!");
    if (lcdOK) {
      lcd.setCursor(0, 1);
      lcd.print("RFID OK");
    }
  } else {
    Serial.println("RFID ERROR - Verifica conexiones SPI");
    if (lcdOK) {
      lcd.setCursor(0, 1);
      lcd.print("RFID ERROR");
    }
  }
  delay(1500);

  if (lcdOK) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Pase tarjeta");
    lcd.setCursor(0, 1);
    lcd.print(wifiOK ? WiFi.localIP().toString() : "Sin WiFi");
  }

  Serial.println("\nSistema listo!");
  Serial.println("=======================================\n");
}

// =======================================================
//  LOOP
// =======================================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi perdido, reconectando...");
    wifiOK = false;
    if (lcdOK) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Reconectando...");
    }
    WiFi.reconnect();
    delay(3000);
    if (WiFi.status() == WL_CONNECTED) {
      wifiOK = true;
      Serial.println("WiFi reconectado!");
      if (lcdOK) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Pase tarjeta");
        lcd.setCursor(0, 1);
        lcd.print(WiFi.localIP().toString());
      }
    }
    return;
  }

  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    String uid = "";
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
      uid += String(mfrc522.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    Serial.println("UID detectado: " + uid);

    if (lcdOK) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("UID detectado:");
      lcd.setCursor(0, 1);
      lcd.print(uid.length() > 16 ? uid.substring(0, 16) : uid);
    }

    enviarUID(uid);

    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    delay(2000);

    if (lcdOK) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Pase tarjeta");
      lcd.setCursor(0, 1);
      lcd.print(WiFi.localIP().toString());
    }
  }

#ifdef USE_CAMERA
  if (millis() - lastPhotoCheck > PHOTO_CHECK_INTERVAL) {
    lastPhotoCheck = millis();
    checkPhotoRequest();
  }
#endif
}

// =======================================================
//  ENVIAR UID (con foto si hay cámara)
// =======================================================
void enviarUID(const String& uid) {
  if (!wifiOK) return;

  String fotoField = "";

#ifdef USE_CAMERA
  // Descartar frames viejos del buffer
  for (int i = 0; i < 3; i++) {
    camera_fb_t* tmp = esp_camera_fb_get();
    if (tmp) {
      esp_camera_fb_return(tmp);
      delay(50);
    }
  }

  // Capturar frame real
  camera_fb_t* fb = esp_camera_fb_get();
  if (fb) {
    Serial.printf("Foto pase: %zu bytes\n", fb->len);
    String b64 = base64Encode(fb->buf, fb->len);
    esp_camera_fb_return(fb);
    fotoField = ",\"foto\":\"data:image/jpeg;base64," + b64 + "\"";
  } else {
    Serial.println("No se pudo capturar foto en pase");
  }
#endif

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(20000);
  http.begin(client, URL_SET_UID);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  String body = "{\"uid\":\"" + uid + "\"" + fotoField + "}";
  int code = http.POST(body);
  Serial.printf("POST UID -> %d\n", code);
  http.end();
}

#ifdef USE_CAMERA
// =======================================================
//  CÁMARA - INICIALIZACIÓN
// =======================================================
void initCamera() {
  if (lcdOK) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Iniciando Camara");
  }

  camera_config_t config;
  config.ledc_channel  = LEDC_CHANNEL_0;
  config.ledc_timer    = LEDC_TIMER_0;
  config.pin_d0        = Y2_GPIO_NUM;
  config.pin_d1        = Y3_GPIO_NUM;
  config.pin_d2        = Y4_GPIO_NUM;
  config.pin_d3        = Y5_GPIO_NUM;
  config.pin_d4        = Y6_GPIO_NUM;
  config.pin_d5        = Y7_GPIO_NUM;
  config.pin_d6        = Y8_GPIO_NUM;
  config.pin_d7        = Y9_GPIO_NUM;
  config.pin_xclk      = XCLK_GPIO_NUM;
  config.pin_pclk      = PCLK_GPIO_NUM;
  config.pin_vsync     = VSYNC_GPIO_NUM;
  config.pin_href      = HREF_GPIO_NUM;
  config.pin_sccb_sda  = SIOD_GPIO_NUM;
  config.pin_sccb_scl  = SIOC_GPIO_NUM;
  config.pin_pwdn      = PWDN_GPIO_NUM;
  config.pin_reset     = RESET_GPIO_NUM;
  config.xclk_freq_hz  = 20000000;
  config.pixel_format  = PIXFORMAT_JPEG;
  config.frame_size    = FRAMESIZE_SVGA;  // 800x600
  config.jpeg_quality  = 12;
  config.fb_count      = 1;
  config.grab_mode     = CAMERA_GRAB_WHEN_EMPTY;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camara FALLO: 0x%x\n", err);
    if (lcdOK) {
      lcd.setCursor(0, 1);
      lcd.print("Camara ERROR");
      delay(1500);
    }
    return;
  }

  Serial.println("Camara OK");

  delay(1000);
  camera_fb_t* fb_inicial = esp_camera_fb_get();
  if (fb_inicial) {
    esp_camera_fb_return(fb_inicial);
    Serial.println("Buffer inicial limpiado");
  }

  if (lcdOK) {
    lcd.setCursor(0, 1);
    lcd.print("Camara OK");
    delay(1500);
  }
}

// =======================================================
//  POLLING: verificar si la web pidió una foto
// =======================================================
void checkPhotoRequest() {
  if (!wifiOK) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, URL_CHECK_PHOTO);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }

  String resp = http.getString();
  http.end();

  int idIdx = resp.indexOf("\"id\":\"");
  if (idIdx < 0) return;

  int start = idIdx + 6;
  int end   = resp.indexOf("\"", start);
  if (end < 0) return;
  String requestId = resp.substring(start, end);

  Serial.println("Foto solicitada, id: " + requestId);
  if (lcdOK) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Tomando foto...");
  }

  for (int i = 0; i < 3; i++) {
    camera_fb_t* tmp = esp_camera_fb_get();
    if (tmp) {
      esp_camera_fb_return(tmp);
      delay(50);
    }
  }

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Captura fallo");
    if (lcdOK) {
      lcd.setCursor(0, 1);
      lcd.print("Error captura");
      delay(1500);
    }
    return;
  }

  Serial.printf("Foto: %zu bytes\n", fb->len);
  String b64 = base64Encode(fb->buf, fb->len);
  esp_camera_fb_return(fb);

  WiFiClientSecure client2;
  client2.setInsecure();
  HTTPClient http2;
  http2.begin(client2, URL_CHECK_PHOTO);
  http2.addHeader("Content-Type", "application/json");
  http2.addHeader("apikey", SUPABASE_ANON_KEY);
  http2.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  String body = "{\"request_id\":\"" + requestId + "\",\"foto\":\"data:image/jpeg;base64," + b64 + "\"}";
  int pcode = http2.POST(body);
  Serial.printf("POST foto -> %d\n", pcode);
  http2.end();

  if (lcdOK) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(pcode == 200 ? "Foto enviada OK" : "Error foto");
    delay(1500);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Pase tarjeta");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString());
  }
}

// =======================================================
//  BASE64
// =======================================================
const char b64chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

String base64Encode(const uint8_t* data, size_t len) {
  String out;
  out.reserve(((len + 2) / 3) * 4);
  for (size_t i = 0; i < len; i += 3) {
    uint32_t n = ((uint32_t)data[i]) << 16;
    if (i + 1 < len) n |= ((uint32_t)data[i + 1]) << 8;
    if (i + 2 < len) n |= data[i + 2];
    out += b64chars[(n >> 18) & 63];
    out += b64chars[(n >> 12) & 63];
    out += (i + 1 < len) ? b64chars[(n >> 6) & 63] : '=';
    out += (i + 2 < len) ? b64chars[n & 63] : '=';
  }
  return out;
}
#endif
