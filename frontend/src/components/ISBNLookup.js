import React, { useState } from "react";
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
import { Search, BookOpen, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ISBNLookup = ({ placards = [], shelves = [], onSuccess }) => {
  const [isbn, setIsbn] = useState("");
  const [bookInfo, setBookInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlacard, setSelectedPlacard] = useState("");
  const [selectedShelf, setSelectedShelf] = useState("");
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  // Rechercher un livre par ISBN
  const handleSearch = async () => {
    if (!isbn.trim()) {
      toast.error("Veuillez entrer un ISBN");
      return;
    }

    // Validation basique de l'ISBN
    const cleanIsbn = isbn.replace(/[-\s]/g, "");
    if (!/^\d{10}$/.test(cleanIsbn) && !/^\d{13}$/.test(cleanIsbn)) {
      toast.error("Veuillez entrer un ISBN valide (10 ou 13 chiffres)");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setBookInfo(null);

      const response = await axios.get(`${API}/isbn/${cleanIsbn}`);
      setBookInfo(response.data);
      toast.success(`Livre trouvé via ${response.data.source} !`);
    } catch (error) {
      console.error("Erreur lors de la recherche ISBN:", error);
      const errorMessage = error.response?.data?.detail || "Erreur lors de la recherche";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Ajouter le livre à la bibliothèque
  const handleAddBook = async () => {
    if (!bookInfo || !selectedPlacard || !selectedShelf) {
      toast.error("Veuillez sélectionner un placard et une étagère");
      return;
    }

    try {
      setAdding(true);
      
      const bookData = {
        title: bookInfo.title || "Livre sans titre",
        author: bookInfo.authors?.join(", ") || "Auteur inconnu",
        edition: bookInfo.publisher || "",
        isbn: bookInfo.isbn || isbn,
        count: 1,
        placard: selectedPlacard,
        shelf: selectedShelf,
        description: bookInfo.description || "",
        language: bookInfo.language || "fr",
        pages: bookInfo.page_count || null,
        publication_year: bookInfo.publication_date ? new Date(bookInfo.publication_date).getFullYear() : null
      };

      await axios.post(`${API}/books`, bookData);
      
      toast.success(`Livre "${bookInfo.title}" ajouté avec succès !`);
      
      // Réinitialiser le formulaire
      setIsbn("");
      setBookInfo(null);
      setSelectedPlacard("");
      setSelectedShelf("");
      setError(null);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Erreur lors de l'ajout du livre:", error);
      toast.error("Erreur lors de l'ajout du livre");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Recherche ISBN */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            Recherche par ISBN
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="Entrez un ISBN (ex: 9782070360130)"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={loading} className="button-primary">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Rechercher
            </Button>
          </div>
          
          <p className="text-sm text-gray-600">
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

      {/* Résultat de la recherche */}
      {bookInfo && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-4">
              <CheckCircle className="h-6 w-6 text-green-600 mt-1" />
              <div className="flex-1">
                <h3 className="text-xl font-bold text-green-800 mb-2">
                  {bookInfo.title || "Titre non disponible"}
                </h3>
                <div className="space-y-2">
                  <p className="text-green-700">
                    <strong>Auteur(s):</strong> {bookInfo.authors?.join(", ") || "Non disponible"}
                  </p>
                  {bookInfo.publisher && (
                    <p className="text-green-700">
                      <strong>Éditeur:</strong> {bookInfo.publisher}
                    </p>
                  )}
                  {bookInfo.publication_date && (
                    <p className="text-green-700">
                      <strong>Date de publication:</strong> {bookInfo.publication_date}
                    </p>
                  )}
                  {bookInfo.page_count && (
                    <p className="text-green-700">
                      <strong>Nombre de pages:</strong> {bookInfo.page_count}
                    </p>
                  )}
                  <p className="text-green-700">
                    <strong>ISBN:</strong> {bookInfo.isbn}
                  </p>
                  {bookInfo.description && (
                    <div className="mt-3">
                      <strong className="text-green-800">Description:</strong>
                      <p className="text-green-700 text-sm mt-1 leading-relaxed">
                        {bookInfo.description.length > 200 
                          ? bookInfo.description.substring(0, 200) + "..." 
                          : bookInfo.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Source de l'information */}
            <div className="text-xs text-gray-500 border-t pt-2">
              Informations provenant de : {bookInfo.source}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Ajout à la bibliothèque */}
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
                <Label htmlFor="placard">Placard</Label>
                <Select value={selectedPlacard} onValueChange={setSelectedPlacard}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un placard" />
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
                <Label htmlFor="shelf">Étagère</Label>
                <Select value={selectedShelf} onValueChange={setSelectedShelf}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une étagère" />
                  </SelectTrigger>
                  <SelectContent>
                    {shelves
                      .filter(shelf => !selectedPlacard || shelf.placard_name === selectedPlacard)
                      .map(shelf => (
                        <SelectItem key={shelf.id} value={shelf.name}>
                          Étagère {shelf.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button 
                onClick={handleAddBook}
                disabled={!selectedPlacard || !selectedShelf || adding}
                className="button-success"
              >
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