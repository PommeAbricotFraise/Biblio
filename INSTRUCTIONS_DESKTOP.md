# 🖥️ Instructions pour créer l'application Desktop

## 📋 Prérequis

1. **Node.js** (version 16 ou supérieure)
2. **Python** (version 3.8 ou supérieure) 
3. **Git** installé sur votre système

## 🚀 Étapes de création

### 1. Export depuis Emergent vers GitHub

1. Dans votre interface Emergent, cliquez sur l'icône **GitHub** 
2. Connectez votre compte GitHub
3. Créez un nouveau repository nommé `bibliotheque-scolaire-desktop`
4. Exportez tout le code

### 2. Cloner et préparer le projet

```bash
# Cloner votre repository
git clone https://github.com/VOTRE_USERNAME/bibliotheque-scolaire-desktop.git
cd bibliotheque-scolaire-desktop

# Copier les fichiers de configuration Electron
# (Copiez les fichiers desktop-package.json, electron-main.js, preload.js depuis Emergent)

# Renommer le package.json principal
mv package.json package-web.json
mv desktop-package.json package.json
```

### 3. Installation des dépendances

```bash
# Installer les dépendances Electron
npm install

# Installer les dépendances frontend
cd frontend
npm install
cd ..

# Installer les dépendances backend Python
cd backend  
pip install -r requirements.txt
cd ..
```

### 4. Créer les icônes de l'application

Vous aurez besoin d'icônes dans différents formats :

- **Windows** : `icon.ico` (256x256)
- **macOS** : `icon.icns` (512x512) 
- **Linux** : `icon.png` (512x512)

Placez ces fichiers à la racine du projet.

### 5. Modifier la configuration frontend

Dans `frontend/.env`, changez :
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

### 6. Modifier la configuration backend

Dans `backend/.env`, assurez-vous d'avoir :
```env
MONGO_URL=mongodb://localhost:27017/bibliotheque_scolaire
```

### 7. Build de l'application frontend

```bash
cd frontend
npm run build
cd ..
```

### 8. Test en mode développement

```bash
npm run electron-dev
```

### 9. Créer les exécutables

#### Pour Windows (.exe) :
```bash
npm run dist-win
```

#### Pour macOS (.dmg) :
```bash  
npm run dist-mac
```

#### Pour Linux (.AppImage) :
```bash
npm run dist-linux
```

#### Pour tous les systèmes :
```bash
npm run dist
```

## 📁 Structure des fichiers créés

```
dist/
├── win-unpacked/          # Windows (dossier)
├── Bibliothèque Scolaire Setup 1.0.0.exe  # Installateur Windows
├── Bibliothèque Scolaire-1.0.0.dmg        # Installateur macOS  
└── Bibliothèque Scolaire-1.0.0.AppImage    # Application Linux
```

## 🎯 Fonctionnalités de l'application desktop

- ✅ **Installation native** sur Windows, macOS, Linux
- ✅ **Raccourci bureau** automatique
- ✅ **Menu application** complet
- ✅ **Raccourcis clavier** (Ctrl+1, Ctrl+2, etc.)
- ✅ **Serveur backend intégré** (pas besoin d'installation séparée)
- ✅ **Base de données locale** MongoDB
- ✅ **Fonctionne hors-ligne** une fois installé

## 🔧 Dépannage

### Si MongoDB n'est pas installé localement :
1. Installer MongoDB Community Edition
2. Ou utiliser une base SQLite (modification du backend nécessaire)

### Si Python n'est pas trouvé :
1. Vérifier que Python est dans le PATH système
2. Ou packager Python avec l'application (configuration avancée)

### Si l'application ne démarre pas :
1. Vérifier les logs dans : `%APPDATA%/bibliotheque-scolaire/logs` (Windows)
2. Ou dans `~/Library/Application Support/bibliotheque-scolaire/logs` (macOS)

## 📦 Distribution

Une fois créé, vous pouvez distribuer :

- **L'installateur Windows** (`.exe`) - Les écoles le téléchargent et installent
- **Le fichier DMG macOS** - Pour les Macs  
- **L'AppImage Linux** - Exécutable directement sur Linux

## 🎉 Résultat final

Vous aurez une **vraie application desktop** que les écoles peuvent :

- ✅ **Télécharger** depuis votre site web
- ✅ **Installer** comme n'importe quel logiciel  
- ✅ **Utiliser hors-ligne** (données locales)
- ✅ **Lancer** depuis le bureau ou menu démarrer
- ✅ **Désinstaller** proprement si besoin

L'application aura la même interface et fonctionnalités que votre version web, mais packagée comme un vrai logiciel !