#!/bin/bash
# Ejecutar en Git Bash DENTRO de la carpeta sobrevive-noche-zombie-vr
# Copia los recursos de la práctica 3.5 (zombie + música) y crea el repositorio local.
set -e
mkdir -p assets/models/fbx
ORIGEN="../graf-threejs3dIntegral/models"
cp "$ORIGEN"/fbx/{Dancing,Idle,Walking,Stumbling,Dying}.fbx assets/models/fbx/
cp "$ORIGEN"/audio/zombie_dance.mp3 assets/audio/
echo "Recursos copiados:"; ls assets/models/fbx assets/audio
git init -b main
git add .
git commit -m "Practica 3.7: Sobrevive a la Noche del Zombie (VR Meta Quest 3)"
git log --oneline
echo "Tamaño del proyecto:"; du -sh --exclude=.git .
