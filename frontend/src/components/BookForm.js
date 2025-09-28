import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, X, BookOpen, Sparkles } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BookForm = ({ book = null, placards = [], shelves = [], onSuccess }) => {
  const [formData, setFormData] = useState({
    title: "",
    author: "",
    edition: "",
    isbn: "",
    count: 1,
    placard: "",
    shelf: "",
    description: "",
    barcode: "",
    language: "fr",
    pages: "",
    publication_year: ""
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Pré-remplir le formulaire si on modifie un livre
  useEffect(() => {
    if (book) {
      setFormData({
        title: book.title || "",
        author: book.author || "",
        edition: book.edition || "",
        isbn: book.isbn || "",
        count: book.count || 1,
        placard: book.placard || "",
        shelf: book.shelf || "",
        description: book.description || "",
        barcode: book.barcode || "",
        language: book.language || "fr",
        pages: book.pages || "",
        publication_year: book.publication_year || ""
      });
    }
  }, [book]);

  const handleInputChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    // Effacer l'erreur pour ce champ
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = "Le titre est obligatoire";
    }

    if (!formData.author.trim()) {
      newErrors.author = "L'auteur est obligatoire";
    }

    if (!formData.placard) {
      newErrors.placard = "Le placard est obligatoire";
    }

    if (!formData.shelf) {
      newErrors.shelf = "L'étagère est obligatoire";
    }

    if (formData.count < 1) {
      newErrors.count = "Le nombre d'exemplaires doit être au moins 1";
    }

    if (formData.pages && (isNaN(formData.pages) || formData.pages < 1)) {
      newErrors.pages = "Le nombre de pages doit être un nombre positif";
    }

    if (formData.publication_year && (isNaN(formData.publication_year) || formData.publication_year < 1000 || formData.publication_year > new Date().getFullYear())) {
      newErrors.publication_year = "L'année de publication n'est pas valide";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error("Veuillez corriger les erreurs du formulaire");
      return;
    }

    try {
      setLoading(true);
      
      // Préparer les données
      const submitData = {
        ...formData,
        count: parseInt(formData.count),
        pages: formData.pages ? parseInt(formData.pages) : null,
        publication_year: formData.publication_year ? parseInt(formData.publication_year) : null
      };

      if (book) {
        // Modification
        await axios.put(`${API}/books/${book.id}`, submitData);
        toast.success("📚 Livre modifié avec succès !");
      } else {
        // Création
        await axios.post(`${API}/books`, submitData);
        toast.success("🎉 Livre ajouté avec succès !");
      }

      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      toast.error("❌ Erreur lors de la sauvegarde du livre");
    } finally {
      setLoading(false);
    }
  };

  // Filtrer les étagères selon le placard sélectionné
  const filteredShelves = shelves.filter(shelf => 
    formData.placard === "" || shelf.placard_name === formData.placard
  );

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center mb-3">
          <BookOpen className="h-8 w-8 text-blue-600 mr-3" />
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {book ? "✏️ Modifier le livre" : "➕ Ajouter un nouveau livre"}
          </h2>
          <Sparkles className="h-6 w-6 text-yellow-500 ml-3" />
        </div>
        <p className="text-gray-600 text-lg">
          {book ? "Modifiez les informations de votre livre" : "Remplissez les informations de votre nouveau livre"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Titre */}
          <div className="md:col-span-2">
            <Label htmlFor="title" className="text-lg font-semibold text-gray-700">
              📖 Titre du livre *
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder="Écrivez le titre de votre livre..."
              className={`form-input text-lg ${errors.title ? "border-red-500" : ""}`}
            />
            {errors.title && (
              <p className="text-red-500 text-sm mt-1 flex items-center">
                ❌ {errors.title}
              </p>
            )}
          </div>

          {/* Auteur */}
          <div>
            <Label htmlFor="author" className="text-lg font-semibold text-gray-700">
              ✍️ Auteur *
            </Label>
            <Input
              id="author"
              value={formData.author}
              onChange={(e) => handleInputChange("author", e.target.value)}
              placeholder="Nom de l'auteur..."
              className={`form-input text-lg ${errors.author ? "border-red-500" : ""}`}
            />
            {errors.author && (
              <p className="text-red-500 text-sm mt-1 flex items-center">
                ❌ {errors.author}
              </p>
            )}
          </div>

          {/* Édition */}
          <div>
            <Label htmlFor="edition" className="text-lg font-semibold text-gray-700">
              🏢 Éditeur
            </Label>
            <Input
              id="edition"
              value={formData.edition}
              onChange={(e) => handleInputChange("edition", e.target.value)}
              placeholder="Nom de l'éditeur..."
              className="form-input text-lg"
            />
          </div>

          {/* Placard */}
          <div>
            <Label htmlFor="placard" className="text-lg font-semibold text-gray-700">
              🗄️ Placard *
            </Label>
            <Select 
              value={formData.placard} 
              onValueChange={(value) => {
                handleInputChange("placard", value);
                // Reset shelf when placard changes
                if (formData.shelf && !filteredShelves.some(shelf => shelf.name === formData.shelf)) {
                  handleInputChange("shelf", "");
                }
              }}
            >
              <SelectTrigger className={`form-input text-lg ${errors.placard ? "border-red-500" : ""}`}>
                <SelectValue placeholder="Choisissez un placard..." />
              </SelectTrigger>
              <SelectContent>
                {placards.map(placard => (
                  <SelectItem key={placard.id} value={placard.name}>
                    🗄️ Placard {placard.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.placard && (
              <p className="text-red-500 text-sm mt-1 flex items-center">
                ❌ {errors.placard}
              </p>
            )}
          </div>

          {/* Étagère */}
          <div>
            <Label htmlFor="shelf" className="text-lg font-semibold text-gray-700">
              📋 Étagère *
            </Label>
            <Select 
              value={formData.shelf} 
              onValueChange={(value) => handleInputChange("shelf", value)}
              disabled={!formData.placard}
            >
              <SelectTrigger className={`form-input text-lg ${errors.shelf ? "border-red-500" : ""}`}>
                <SelectValue placeholder="Choisissez une étagère..." />
              </SelectTrigger>
              <SelectContent>
                {filteredShelves.map(shelf => (
                  <SelectItem key={shelf.id} value={shelf.name}>
                    📋 Étagère {shelf.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.shelf && (
              <p className="text-red-500 text-sm mt-1 flex items-center">
                ❌ {errors.shelf}
              </p>
            )}
          </div>

          {/* Nombre d'exemplaires */}
          <div>
            <Label htmlFor="count" className="text-lg font-semibold text-gray-700">
              🔢 Nombre d'exemplaires *
            </Label>
            <Input
              id="count"
              type="number"
              value={formData.count}
              onChange={(e) => handleInputChange("count", parseInt(e.target.value) || 1)}
              min="1"
              className={`form-input text-lg ${errors.count ? "border-red-500" : ""}`}
            />
            {errors.count && (
              <p className="text-red-500 text-sm mt-1 flex items-center">
                ❌ {errors.count}
              </p>
            )}
          </div>

          {/* ISBN */}
          <div>
            <Label htmlFor="isbn" className="text-lg font-semibold text-gray-700">
              🔢 ISBN
            </Label>
            <Input
              id="isbn"
              value={formData.isbn}
              onChange={(e) => handleInputChange("isbn", e.target.value)}
              placeholder="ISBN du livre..."
              className="form-input text-lg"
            />
          </div>

          {/* Langue */}
          <div>
            <Label htmlFor="language" className="text-lg font-semibold text-gray-700">
              🌍 Langue
            </Label>
            <Select 
              value={formData.language} 
              onValueChange={(value) => handleInputChange("language", value)}
            >
              <SelectTrigger className="form-input text-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">🇫🇷 Français</SelectItem>
                <SelectItem value="en">🇬🇧 Anglais</SelectItem>
                <SelectItem value="es">🇪🇸 Espagnol</SelectItem>
                <SelectItem value="de">🇩🇪 Allemand</SelectItem>
                <SelectItem value="it">🇮🇹 Italien</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Nombre de pages */}
          <div>
            <Label htmlFor="pages" className="text-lg font-semibold text-gray-700">
              📄 Nombre de pages
            </Label>
            <Input
              id="pages"
              type="number"
              value={formData.pages}
              onChange={(e) => handleInputChange("pages", e.target.value)}
              min="1"
              placeholder="Ex: 250"
              className={`form-input text-lg ${errors.pages ? "border-red-500" : ""}`}
            />
            {errors.pages && (
              <p className="text-red-500 text-sm mt-1 flex items-center">
                ❌ {errors.pages}
              </p>
            )}
          </div>

          {/* Année de publication */}
          <div>
            <Label htmlFor="publication_year" className="text-lg font-semibold text-gray-700">
              📅 Année de publication
            </Label>
            <Input
              id="publication_year"
              type="number"
              value={formData.publication_year}
              onChange={(e) => handleInputChange("publication_year", e.target.value)}
              min="1000"
              max={new Date().getFullYear()}
              placeholder="Ex: 2020"
              className={`form-input text-lg ${errors.publication_year ? "border-red-500" : ""}`}
            />
            {errors.publication_year && (
              <p className="text-red-500 text-sm mt-1 flex items-center">
                ❌ {errors.publication_year}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <Label htmlFor="description" className="text-lg font-semibold text-gray-700">
            📝 Description du livre
          </Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleInputChange("description", e.target.value)}
            placeholder="Décrivez votre livre, son histoire, ses personnages..."
            rows={4}
            className="form-input text-lg resize-none"
          />
        </div>

        {/* Boutons d'action */}
        <div className="flex justify-center space-x-6 pt-6 border-t-2 border-purple-200">
          <Button 
            type="button" 
            onClick={() => onSuccess()}
            disabled={loading}
            className="bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white hover-lift px-8 py-3 text-lg"
          >
            <X className="h-5 w-5 mr-2" />
            ❌ Annuler
          </Button>
          <Button 
            type="submit" 
            disabled={loading}
            className="button-success hover-lift px-8 py-3 text-lg"
          >
            <Save className="h-5 w-5 mr-2" />
            {loading ? "💾 Sauvegarde..." : book ? "✏️ Modifier" : "➕ Ajouter"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default BookForm;