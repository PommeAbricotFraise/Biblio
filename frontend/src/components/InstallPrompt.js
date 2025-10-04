import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, X, Smartphone } from "lucide-react";

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      // Empêcher Chrome 67 et versions antérieures d'afficher automatiquement le prompt
      e.preventDefault();
      // Stocker l'événement pour qu'il puisse être déclenché plus tard
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Afficher le prompt d'installation
    deferredPrompt.prompt();

    // Attendre que l'utilisateur réponde au prompt
    const { outcome } = await deferredPrompt.userChoice;

    console.log(`User response to the install prompt: ${outcome}`);

    // Réinitialiser la variable deferredPrompt car elle ne peut être utilisée qu'une fois
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <Card className="fixed bottom-4 right-4 max-w-sm z-50 shadow-2xl border-2 border-blue-400 bg-gradient-to-br from-blue-50 to-purple-50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Smartphone className="h-6 w-6 text-blue-600" />
            <h3 className="font-bold text-blue-800">Installer l'application</h3>
          </div>
          <Button 
            onClick={handleDismiss}
            variant="ghost"
            size="sm"
            className="p-1 h-auto text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <p className="text-sm text-gray-700 mb-4">
          Installez l'application sur votre bureau pour un accès rapide, même hors-ligne !
        </p>
        
        <div className="flex space-x-2">
          <Button 
            onClick={handleInstall}
            className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Installer
          </Button>
          <Button 
            onClick={handleDismiss}
            variant="outline"
            size="sm"
            className="px-3"
          >
            Plus tard
          </Button>
        </div>
        
        <div className="mt-3 text-xs text-gray-500">
          ✅ Accès rapide depuis le bureau<br />
          ✅ Fonctionne partiellement hors-ligne<br />
          ✅ Interface comme une vraie application
        </div>
      </CardContent>
    </Card>
  );
};

export default InstallPrompt;