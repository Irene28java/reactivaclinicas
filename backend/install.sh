#!/bin/bash
echo "Instalando backend..."
cd backend
npm install
echo "Creando base de datos inicial..."
node -e "require('./database')"
echo "Backend listo ✅"