const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');

// Configuration
const isDev = process.env.ELECTRON_IS_DEV === 'true';
const FRONTEND_PORT = 3000;
const BACKEND_PORT = 8001;

let mainWindow;
let backendProcess;
let frontendServer;

// Créer la fenêtre principale
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    show: false,
    titleBarStyle: 'default',
    title: 'Bibliothèque Scolaire - Système de Gestion'
  });

  // Chargement de l'application
  const startURL = isDev 
    ? `http://localhost:${FRONTEND_PORT}` 
    : `http://localhost:${FRONTEND_PORT}`;

  mainWindow.loadURL(startURL);

  // Afficher la fenêtre quand elle est prête
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Ouvrir les DevTools en développement
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Gérer la fermeture de la fenêtre
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Ouvrir les liens externes dans le navigateur par défaut
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Menu de l'application
  createMenu();
}

// Créer le menu de l'application
function createMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouvelle recherche',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('navigate', '/books');
          }
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Tableau de bord',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            mainWindow.webContents.send('navigate', '/');
          }
        },
        {
          label: 'Mes Livres',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            mainWindow.webContents.send('navigate', '/books');
          }
        },
        {
          label: 'Rangements',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            mainWindow.webContents.send('navigate', '/storage');
          }
        },
        {
          label: 'Visualisation 3D',
          accelerator: 'CmdOrCtrl+4',
          click: () => {
            mainWindow.webContents.send('navigate', '/visualization');
          }
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Actualiser' },
        { role: 'forceReload', label: 'Actualisation forcée' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom par défaut' },
        { role: 'zoomIn', label: 'Zoomer' },
        { role: 'zoomOut', label: 'Dézoomer' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'À propos',
          click: () => {
            const aboutWindow = new BrowserWindow({
              width: 400,
              height: 300,
              resizable: false,
              parent: mainWindow,
              modal: true,
              show: false
            });

            aboutWindow.loadURL(`data:text/html,
              <html>
                <head>
                  <title>À propos</title>
                  <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                    h1 { margin-bottom: 20px; }
                    p { margin: 10px 0; }
                  </style>
                </head>
                <body>
                  <h1>📚 Bibliothèque Scolaire</h1>
                  <p><strong>Version:</strong> 1.0.0</p>
                  <p><strong>Système de gestion:</strong> FastAPI + React</p>
                  <p><strong>Créé avec:</strong> Emergent Agent</p>
                  <p><strong>Copyright:</strong> 2024</p>
                </body>
              </html>
            `);

            aboutWindow.once('ready-to-show', () => {
              aboutWindow.show();
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Démarrer le serveur frontend (fichiers statiques React)
function startFrontendServer() {
  return new Promise((resolve, reject) => {
    const app = express();
    
    app.use(cors());
    
    // Servir les fichiers statiques du build React
    const buildPath = path.join(__dirname, 'frontend', 'build');
    app.use(express.static(buildPath));
    
    // Toutes les routes renvoient vers index.html (pour React Router)
    app.get('*', (req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });
    
    frontendServer = app.listen(FRONTEND_PORT, 'localhost', (err) => {
      if (err) {
        console.error('Erreur démarrage frontend:', err);
        reject(err);
      } else {
        console.log(`Frontend démarré sur http://localhost:${FRONTEND_PORT}`);
        resolve();
      }
    });
  });
}

// Démarrer le serveur backend Python
function startBackendServer() {
  return new Promise((resolve, reject) => {
    const backendPath = path.join(__dirname, 'backend');
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    
    backendProcess = spawn(pythonExecutable, ['server.py'], {
      cwd: backendPath,
      env: { ...process.env, PYTHONPATH: backendPath }
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend fermé avec le code ${code}`);
    });

    // Attendre que le backend soit prêt
    setTimeout(() => {
      console.log(`Backend démarré sur le port ${BACKEND_PORT}`);
      resolve();
    }, 3000);
  });
}

// Événements de l'application
app.whenReady().then(async () => {
  try {
    // Démarrer les serveurs
    await startBackendServer();
    await startFrontendServer();
    
    // Créer la fenêtre principale
    createWindow();
    
  } catch (error) {
    console.error('Erreur lors du démarrage:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Fermer les serveurs
  if (backendProcess) {
    backendProcess.kill();
  }
  
  if (frontendServer) {
    frontendServer.close();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Gérer la fermeture propre
app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  
  if (frontendServer) {
    frontendServer.close();
  }
});