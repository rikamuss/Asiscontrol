<div align="center">

# 📋 Asiscontrol

**Sistema de control de asistencia con lector RFID (ESP32) y panel web en tiempo real**

![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/-React-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/-TailwindCSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![ESP32](https://img.shields.io/badge/-ESP32-E7352C?style=flat-square&logo=espressif&logoColor=white)
![Vercel](https://img.shields.io/badge/-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![Status](https://img.shields.io/badge/status-funcional-brightgreen?style=flat-square)

</div>

---

## 📌 Descripción

**Asiscontrol** es un sistema de control de asistencia que combina **hardware y software**: un dispositivo **ESP32 con lector RFID** registra la asistencia al pasar una tarjeta, y esos registros se sincronizan en tiempo real con una base de datos en **Supabase**. Los usuarios acceden a un panel web (React + TypeScript) donde pueden consultar su historial de asistencia y generar reportes.

## ✨ Características

- 🪪 Registro de asistencia mediante **tarjeta RFID** leída por un dispositivo **ESP32**
- ☁️ Sincronización de los registros en tiempo real con **Supabase**
- 📊 Panel web para consultar **historial de asistencia**
- 📈 **Reportes generales** de asistencia
- ⚡ Interfaz moderna construida con React, TypeScript, Tailwind CSS y shadcn/ui

## 🛠️ Tecnologías utilizadas

**Frontend**
`React` · `TypeScript` · `Vite` · `Tailwind CSS` · `shadcn/ui`

**Backend / Base de datos**
`Supabase`

**Hardware / Firmware**
`ESP32` (C++/Arduino) · Lector RFID

**Testing**
`Playwright`

**Despliegue**
`Vercel`

**Gestor de paquetes**
`Bun`

## 🏗️ Arquitectura

```
[ Tarjeta RFID ] → [ ESP32 + lector RFID ] → [ Supabase (DB en tiempo real) ] → [ Panel Web (React) ]
```

1. El usuario pasa su tarjeta RFID por el lector conectado al ESP32.
2. El ESP32 envía el registro de asistencia a Supabase.
3. La aplicación web consulta Supabase y muestra el historial y los reportes al usuario.

## 🚀 Instalación

### Aplicación web

```bash
# Clonar el repositorio
git clone https://github.com/rikamuss/Asiscontrol.git
cd Asiscontrol

# Instalar dependencias
bun install

# Configurar variables de entorno
cp .env.example .env
# Completa .env con tus credenciales de Supabase (URL y API key)

# Ejecutar en modo desarrollo
bun run dev
```

### Firmware ESP32

1. Abre `esp32_sketch.ino` en el **Arduino IDE** (o PlatformIO).
2. Configura tus credenciales de red WiFi y las credenciales de conexión a Supabase dentro del sketch.
3. Conecta el módulo lector RFID al ESP32 según tu esquema de pines.
4. Sube el sketch al ESP32.

## 🧪 Testing

```bash
bunx playwright test
```

## 📄 Estado del proyecto

✅ Proyecto terminado y funcional.

