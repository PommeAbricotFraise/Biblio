import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ScanLine, 
  Wifi, 
  Bluetooth, 
  Usb,
  Camera,
  BookOpen,
  Plus,
  CheckCircle,
  AlertCircle,
  Keyboard
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BarcodeScanner = ({ placards = [], shelves = [], onBookFound, onSuccess }) => {
  const [scanMode, setScanMode] = useState("manual"); // manual, camera, bluetooth, wifi, usb
  const [isScanning, setIsScanning] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [selectedPlacard, setSelectedPlacard] = useState("__default__");
  const [selectedShelf, setSelectedShelf] = useState("__default__");
  const [bookInfo, setBookInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  // Options de connexion de scanner
  const scannerModes = [
    { 
      value: "manual", 
      label: "⌨️ Saisie manuelle", 
      icon: Keyboard,
      description: "Tapez le code-barres manuellement"
    },
    { 
      value: "camera", 
      label: "📱 Caméra", 
      icon: Camera,
      description: "Utilisez la caméra de votre appareil"
    },
    { 
      value: "bluetooth", 
      label: "🔵 Bluetooth", 
      icon: Bluetooth,
      description: "Scanner connecté en Bluetooth"
    },
    { 
      value: "wifi", 
      label: "📶 WiFi", 
      icon: Wifi,
      description: "Scanner connecté en WiFi"
    },
    { 
      value: "usb", 
      label: "🔌 USB", 
      icon: Usb,
      description: "Scanner connecté par câble USB"
    }
  ];

  // Réinitialiser les données
  const resetScanData = () => {
    setScannedCode("");
    setBookInfo(null);
    setSelectedPlacard("__default__");
    setSelectedShelf("__default__");
  };

  // Scanner un code-barres
  const handleScanBarcode = async () => {
    if (!scannedCode.trim()) {
      toast.error("Veuillez entrer un code-barres");
      return;
    }

    if (selectedPlacard === "__default__" || selectedShelf === "__default__") {
      toast.error("Veuillez choisir un emplacement pour le livre");
      return;
    }

    try {
      setLoading(true);
      
      // Appeler l'API de scan
      const response = await axios.post(`${API}/barcode/scan`, {
        barcode: scannedCode.trim(),
        placard: selectedPlacard,
        shelf: selectedShelf
      });

      setBookInfo(response.data.book_info);
      toast.success("🎉 Livre trouvé via le code-barres !");
      
      if (onBookFound) {
        onBookFound(response.data);
      }
    } catch (error) {
      console.error("Erreur lors du scan:", error);
      if (error.response?.status === 404) {
        toast.error("❌ Aucune information trouvée pour ce code-barres");
      } else {
        toast.error("❌ Erreur lors du scan du code-barres");
      }
      setBookInfo(null);
    } finally {
      setLoading(false);
    }
  };

  // Ajouter le livre trouvé à la bibliothèque
  const handleAddBookFromScan = async () => {
    if (!bookInfo) return;

    try {
      setLoading(true);

      const bookData = {
        title: bookInfo.title || "Livre sans titre",
        author: bookInfo.authors?.join(", ") || "Auteur inconnu",
        edition: bookInfo.publisher || "",
        isbn: bookInfo.isbn || scannedCode,
        count: 1,
        placard: selectedPlacard,
        shelf: selectedShelf,
        description: bookInfo.description || "",
        barcode: scannedCode,
        language: bookInfo.language || "fr",
        pages: bookInfo.page_count || null,
        publication_year: bookInfo.publication_date ? new Date(bookInfo.publication_date).getFullYear() : null
      };

      await axios.post(`${API}/books`, bookData);
      
      toast.success(`📚 Livre "${bookInfo.title}" ajouté avec succès !`);
      resetScanData();
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Erreur lors de l'ajout:", error);
      toast.error("❌ Erreur lors de l'ajout du livre");
    } finally {
      setLoading(false);
    }
  };

  // Obtenir l'icône du mode de scan
  const getScanModeIcon = (mode) => {
    const modeData = scannerModes.find(m => m.value === mode);
    return modeData ? modeData.icon : ScanLine;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <ScanLine className="h-10 w-10 text-blue-500 mr-3" />
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
            Scanner de Codes-barres
          </h2>
        </div>
        <p className="text-lg text-gray-600">
          📱 Scannez ou tapez un code-barres pour ajouter un livre automatiquement
        </p>
      </div>

      {/* Mode de scan */}
      <Card className="library-card">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <Camera className="h-6 w-6 mr-2 text-purple-600" />
            Mode de connexion du scanner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scannerModes.map(mode => {
              const ModeIcon = mode.icon;
              return (
                <div 
                  key={mode.value}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                    scanMode === mode.value 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                  onClick={() => setScanMode(mode.value)}
                >
                  <div className="flex flex-col items-center text-center space-y-2">
                    <ModeIcon className={`h-8 w-8 ${scanMode === mode.value ? 'text-blue-600' : 'text-gray-500'}`} />
                    <h3 className={`font-semibold ${scanMode === mode.value ? 'text-blue-600' : 'text-gray-700'}`}>
                      {mode.label}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {mode.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Interface de scan */}
      <Card className="library-card">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            {React.createElement(getScanModeIcon(scanMode), { className: "h-6 w-6 mr-2 text-green-600" })}
            Scanner un code-barres
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Emplacement du livre */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scan-placard" className="text-lg font-semibold">Rangement *</Label>
              <Select value={selectedPlacard} onValueChange={setSelectedPlacard}>
                <SelectTrigger className="form-input text-lg mt-2">
                  <SelectValue placeholder="Choisir un rangement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Choisir un rangement</SelectItem>
                  {placards.map(placard => (
                    <SelectItem key={placard.id} value={placard.name}>
                      🗄️ {placard.storage_type || "Placard"} {placard.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="scan-shelf" className="text-lg font-semibold">Étagère *</Label>
              <Select value={selectedShelf} onValueChange={setSelectedShelf}>
                <SelectTrigger className="form-input text-lg mt-2">
                  <SelectValue placeholder="Choisir une étagère" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Choisir une étagère</SelectItem>
                  {shelves
                    .filter(shelf => selectedPlacard === "__default__" || shelf.placard_name === selectedPlacard)
                    .map(shelf => (
                      <SelectItem key={shelf.id} value={shelf.name}>
                        📋 Étagère {shelf.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Saisie du code-barres */}
          <div>
            <Label htmlFor="barcode-input" className="text-lg font-semibold">
              Code-barres {scanMode === "manual" ? "(Saisie manuelle)" : `(${scannerModes.find(m => m.value === scanMode)?.label})`}
            </Label>
            <div className="flex gap-3 mt-2">
              <Input
                id="barcode-input"
                placeholder={scanMode === "manual" ? "Tapez le code-barres..." : "Le code apparaîtra automatiquement..."}
                value={scannedCode}
                onChange={(e) => setScannedCode(e.target.value)}
                className="form-input text-lg"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleScanBarcode();
                  }
                }}
              />
              <Button
                onClick={handleScanBarcode}
                disabled={loading || !scannedCode.trim() || selectedPlacard === "__default__" || selectedShelf === "__default__"}
                className="button-primary px-6 py-3 text-lg"
              >
                {loading ? "Scan..." : "🔍 Scanner"}
              </Button>
            </div>
          </div>

          {/* Informations sur le mode de scan sélectionné */}
          <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 rounded-lg border-l-4 border-blue-400">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-6 w-6 text-blue-600 mt-1" />
              <div>
                <h4 className="font-semibold text-blue-800 mb-2">
                  Mode sélectionné: {scannerModes.find(m => m.value === scanMode)?.label}
                </h4>
                {scanMode === "manual" && (
                  <p className="text-blue-700">
                    ⌨️ Tapez manuellement le code-barres dans le champ ci-dessus et appuyez sur "Scanner" ou Entrée.
                  </p>
                )}
                {scanMode === "camera" && (
                  <p className="text-blue-700">
                    📱 La caméra sera activée pour scanner le code-barres automatiquement.
                    <br />
                    <span className="text-sm italic">Note: Cette fonction nécessite une implémentation avancée de scanner caméra.</span>
                  </p>
                )}
                {["bluetooth", "wifi", "usb"].includes(scanMode) && (
                  <p className="text-blue-700">
                    🔗 Assurez-vous que votre scanner {scanMode} est correctement connecté. 
                    Le code apparaîtra automatiquement dans le champ quand vous scannerez.
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Résultat du scan */}
      {bookInfo && (
        <Card className="library-card border-2 border-green-400">
          <CardHeader>
            <CardTitle className="text-xl flex items-center text-green-700">
              <CheckCircle className="h-6 w-6 mr-2" />
              Livre trouvé !
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 p-6 rounded-lg">
              <div className="flex items-start space-x-4">
                <BookOpen className="h-12 w-12 text-green-600 mt-2" />
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-green-800 mb-2">
                    {bookInfo.title || "Titre non disponible"}
                  </h3>
                  <p className="text-lg text-green-700 mb-2">
                    ✍️ <strong>Auteur:</strong> {bookInfo.authors?.join(", ") || "Auteur inconnu"}
                  </p>
                  {bookInfo.publisher && (
                    <p className="text-green-600 mb-1">
                      🏢 <strong>Éditeur:</strong> {bookInfo.publisher}
                    </p>
                  )}
                  {bookInfo.publication_date && (
                    <p className="text-green-600 mb-1">
                      📅 <strong>Date:</strong> {bookInfo.publication_date}
                    </p>
                  )}
                  {bookInfo.page_count && (
                    <p className="text-green-600 mb-1">
                      📄 <strong>Pages:</strong> {bookInfo.page_count}
                    </p>
                  )}
                  <p className="text-green-600 mb-1">
                    🔢 <strong>ISBN:</strong> {bookInfo.isbn || scannedCode}
                  </p>
                  <p className="text-green-600">
                    📍 <strong>Sera placé dans:</strong> {selectedPlacard} → Étagère {selectedShelf}
                  </p>
                  {bookInfo.source && (
                    <p className="text-sm text-green-500 mt-2">
                      ℹ️ Source: {bookInfo.source}
                    </p>
                  )}
                </div>
              </div>

              {bookInfo.description && (
                <div className="mt-4 p-3 bg-white rounded border-l-4 border-green-400">
                  <p className="text-sm text-gray-700">
                    <strong>Description:</strong> {bookInfo.description}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <Button 
                onClick={resetScanData}
                variant="outline"
                className="px-6 py-2"
              >
                🔄 Scanner un autre livre
              </Button>
              <Button 
                onClick={handleAddBookFromScan}
                disabled={loading}
                className="button-success px-6 py-2 text-lg"
              >
                {loading ? "Ajout..." : "✅ Ajouter à ma bibliothèque"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BarcodeScanner;