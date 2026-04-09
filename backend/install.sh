#!/bin/bash

echo "🚀 Instalando ReActiva..."

# Backend
echo "📦 Instalando backend..."
cd backend
npm install

# Base de datos
echo "🧠 Inicializando base de datos..."
node -e "require('./database')"

# Variables entorno
echo "⚙️ Configurando entorno..."
cp .env.example .env

# Levantar servidor
echo "🌐 Iniciando servidor..."
npm start &

echo ""
echo "✅ ReActiva instalado correctamente"
echo "👉 Accede a: http://localhost:3000"
echo "👉 Conecta tus redes en el panel"