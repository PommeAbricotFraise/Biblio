import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, BookOpen, AlertCircle, CheckCircle, Loader2, ScanLine, Keyboard } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import BarcodeScanner from "@/components/BarcodeScanner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ISBNLookup = ({ placards = [], shelves = [], onSuccess }) => {
  const [activeTab, setActiveTab] = useState("isbn"); // isbn ou barcode
  const [isbn, setIsbn] = useState("");
  const [bookInfo, setBookInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlacard, setSelectedPlacard] = useState("");
  const [selectedShelf, setSelectedShelf] = useState("");
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  // Nettoyer l'ISBN (retirer les tirets et espaces)
  const cleanISBN = (isbn) => {
    return isbn.replace(/[^0-9X]/g, '');
  };

  // Rechercher les informations du livre par ISBN
  const handleSearch = async () => {
    const cleanedISBN = cleanISBN(isbn);
    if (!cleanedISBN || cleanedISBN.length < 10) {
      toast.error("Veuillez entrer un ISBN valide (10 ou 13 chiffres)");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setBookInfo(null);

      const response = await axios.get(`${API}/isbn/${cleanedISBN}`);
      setBookInfo(response.data);
      toast.success(`Livre trouvé via ${response.data.source} !`);
    } catch (error) {
      console.error("Erreur lors de la recherche ISBN:", error);
      setError("Aucune information trouvée pour cet ISBN");
      toast.error("Aucune information trouvée pour cet ISBN");
    } finally {
      setLoading(false);
    }
  };

  // Ajouter le livre à la bibliothèque
  const handleAddBook = async () => {
    if (!selectedPlacard || !selectedShelf) {
      toast.error("Veuillez sélectionner un placard et une étagère");
      return;
    }

    try {
      setAdding(true);
      
      const response = await axios.post(
        `${API}/books/from-isbn/${cleanISBN(isbn)}?placard=${selectedPlacard}&shelf=${selectedShelf}`
      );
      
      toast.success("Livre ajouté avec succès à la bibliothèque !");
      onSuccess();
    } catch (error) {
      console.error("Erreur lors de l'ajout:", error);
      toast.error("Erreur lors de l'ajout du livre");
    } finally {
      setAdding(false);
    }
  };

  // Filtrer les étagères selon le placard sélectionné
  const filteredShelves = shelves.filter(shelf => 
    selectedPlacard === "" || shelf.placard_name === selectedPlacard
  );

  // Réinitialiser la recherche
  const handleReset = () => {
    setIsbn("");
    setBookInfo(null);
    setError(null);
    setSelectedPlacard("");
    setSelectedShelf("");
  };

  return (
    <div className="space-y-6">
      {/* Onglets */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("isbn")}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 ${
            activeTab === "isbn"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Keyboard className="h-4 w-4" />
          <span>🔍 Recherche ISBN</span>
        </button>
        <button
          onClick={() => setActiveTab("barcode")}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 ${
            activeTab === "barcode"
              ? "bg-white text-green-600 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <ScanLine className="h-4 w-4" />
          <span>📱 Scanner de codes-barres</span>
        </button>
      </div>

      {/* Contenu des onglets */}
      {activeTab === "isbn" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Search className="h-5 w-5 mr-2" />
              Recherche par ISBN
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <div className="flex-1">
              <Label htmlFor="isbn">ISBN</Label>
              <Input
                id="isbn"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="Entrez l'ISBN (ex: 978-2-1234-5678-9)"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleSearch} 
                disabled={loading || !isbn.trim()}
                className="h-10"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                {loading ? "Recherche..." : "Rechercher"}
              </Button>
            </div>
          </div>

          <p className="text-sm text-gray-500">
            La recherche utilise la BNF, Google Books et Open Library
          </p>
        </CardContent>
      </Card>

      {/* Erreur */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-800">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Informations du livre trouvé */}
      {bookInfo && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center text-green-800">
              <CheckCircle className="h-5 w-5 mr-2" />
              Livre trouvé !
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Image de couverture */}
              {bookInfo.thumbnail && (
                <div className="md:col-span-2 flex justify-center">
                  <img 
                    src={bookInfo.thumbnail} 
                    alt={bookInfo.title}
                    className="max-h-48 object-contain rounded-md shadow-sm"
                  />
                </div>
              )}

              {/* Informations principales */}
              <div className="space-y-2">
                <div>
                  <Label className="text-gray-600">Titre</Label>
                  <p className="font-semibold">{bookInfo.title || 'Non spécifié'}</p>
                </div>

                <div>
                  <Label className="text-gray-600">Auteur(s)</Label>
                  <p>{bookInfo.authors?.join(', ') || 'Non spécifié'}</p>
                </div>

                <div>
                  <Label className="text-gray-600">Éditeur</Label>
                  <p>{bookInfo.publisher || 'Non spécifié'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <Label className="text-gray-600">Date de publication</Label>
                  <p>{bookInfo.publication_date || 'Non spécifiée'}</p>
                </div>

                <div>
                  <Label className="text-gray-600">Nombre de pages</Label>
                  <p>{bookInfo.page_count || 'Non spécifié'}</p>
                </div>

                <div>
                  <Label className="text-gray-600">Langue</Label>
                  <p>{bookInfo.language || 'Non spécifiée'}</p>
                </div>
              </div>

              {/* Catégories */}
              {bookInfo.categories?.length > 0 && (
                <div className="md:col-span-2">
                  <Label className="text-gray-600">Catégories</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {bookInfo.categories.map((category, index) => (
                      <span 
                        key={index}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {bookInfo.description && (
                <div className="md:col-span-2">
                  <Label className="text-gray-600">Description</Label>
                  <p className="text-sm text-gray-700 mt-1 line-clamp-4">
                    {bookInfo.description.length > 300 
                      ? bookInfo.description.substring(0, 300) + '...' 
                      : bookInfo.description
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Source de l'information */}
            <div className="text-xs text-gray-500 border-t pt-2">
              Informations provenant de : {bookInfo.source}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ajout à la bibliothèque pour l'onglet ISBN */}
      {bookInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BookOpen className="h-5 w-5 mr-2" />
              Ajouter à la bibliothèque
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sélection du placard */}
              <div>
                <Label htmlFor="placard">Placard *</Label>
                <Select value={selectedPlacard} onValueChange={setSelectedPlacard}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un placard" />
                  </SelectTrigger>
                  <SelectContent>
                    {placards.map(placard => (
                      <SelectItem key={placard.id} value={placard.name}>
                        Placard {placard.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sélection de l'étagère */}
              <div>
                <Label htmlFor="shelf">Étagère *</Label>
                <Select 
                  value={selectedShelf} 
                  onValueChange={setSelectedShelf}
                  disabled={!selectedPlacard}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez une étagère" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredShelves.map(shelf => (
                      <SelectItem key={shelf.id} value={shelf.name}>
                        Étagère {shelf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={handleReset}>
                Nouvelle recherche
              </Button>
              <Button 
                onClick={handleAddBook}
                disabled={adding || !selectedPlacard || !selectedShelf}
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <BookOpen className="h-4 w-4 mr-2" />
                )}
                {adding ? "Ajout..." : "Ajouter à la bibliothèque"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ISBNLookup;