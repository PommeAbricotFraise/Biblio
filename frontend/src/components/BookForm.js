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
import { Save, X } from "lucide-react";
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

  // Catégories prédéfinies
  const categories = [
    "Général", 
    "Littérature", 
    "Science", 
    "Histoire", 
    "Géographie", 
    "Mathématiques", 
    "Art", 
    "Sport", 
    "Jeunesse", 
    "BD/Comics", 
    "Poésie", 
    "Théâtre",
    "Dictionnaire",
    "Encyclopédie",
    "Manuel scolaire"
  ];

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
        toast.success("Livre modifié avec succès !");
      } else {
        // Création
        await axios.post(`${API}/books`, submitData);
        toast.success("Livre ajouté avec succès !");
      }

      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      toast.error("Erreur lors de la sauvegarde du livre");
    } finally {
      setLoading(false);
    }
  };

  // Filtrer les étagères selon le placard sélectionné
  const filteredShelves = shelves.filter(shelf => 
    formData.placard === "" || shelf.placard_name === formData.placard
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Titre */}
        <div className="md:col-span-2">
          <Label htmlFor="title">Titre *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleInputChange("title", e.target.value)}
            placeholder="Titre du livre"
            className={errors.title ? "border-red-500" : ""}
          />
          {errors.title && (
            <p className="text-red-500 text-sm mt-1">{errors.title}</p>
          )}
        </div>

        {/* Auteur */}
        <div>
          <Label htmlFor="author">Auteur *</Label>
          <Input
            id="author"
            value={formData.author}
            onChange={(e) => handleInputChange("author", e.target.value)}
            placeholder="Nom de l'auteur"
            className={errors.author ? "border-red-500" : ""}
          />
          {errors.author && (
            <p className="text-red-500 text-sm mt-1">{errors.author}</p>
          )}
        </div>

        {/* Édition */}
        <div>
          <Label htmlFor="edition">Édition</Label>
          <Input
            id="edition"
            value={formData.edition}
            onChange={(e) => handleInputChange("edition", e.target.value)}
            placeholder="Nom de l'éditeur"
          />
        </div>

        {/* ISBN */}
        <div>
          <Label htmlFor="isbn">ISBN</Label>
          <Input
            id="isbn"
            value={formData.isbn}
            onChange={(e) => handleInputChange("isbn", e.target.value)}
            placeholder="ISBN du livre"
          />
        </div>

        {/* Code-barres */}
        <div>
          <Label htmlFor="barcode">Code-barres</Label>
          <Input
            id="barcode"
            value={formData.barcode}
            onChange={(e) => handleInputChange("barcode", e.target.value)}
            placeholder="Code-barres interne"
          />
        </div>

        {/* Placard */}
        <div>
          <Label htmlFor="placard">Placard *</Label>
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
            <SelectTrigger className={errors.placard ? "border-red-500" : ""}>
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
          {errors.placard && (
            <p className="text-red-500 text-sm mt-1">{errors.placard}</p>
          )}
        </div>

        {/* Étagère */}
        <div>
          <Label htmlFor="shelf">Étagère *</Label>
          <Select 
            value={formData.shelf} 
            onValueChange={(value) => handleInputChange("shelf", value)}
            disabled={!formData.placard}
          >
            <SelectTrigger className={errors.shelf ? "border-red-500" : ""}>
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
          {errors.shelf && (
            <p className="text-red-500 text-sm mt-1">{errors.shelf}</p>
          )}
        </div>

        {/* Catégorie */}
        <div>
          <Label htmlFor="category">Catégorie</Label>
          <Select 
            value={formData.category} 
            onValueChange={(value) => handleInputChange("category", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Nombre d'exemplaires */}
        <div>
          <Label htmlFor="count">Nombre d'exemplaires *</Label>
          <Input
            id="count"
            type="number"
            value={formData.count}
            onChange={(e) => handleInputChange("count", parseInt(e.target.value) || 1)}
            min="1"
            className={errors.count ? "border-red-500" : ""}
          />
          {errors.count && (
            <p className="text-red-500 text-sm mt-1">{errors.count}</p>
          )}
        </div>

        {/* Langue */}
        <div>
          <Label htmlFor="language">Langue</Label>
          <Select 
            value={formData.language} 
            onValueChange={(value) => handleInputChange("language", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="en">Anglais</SelectItem>
              <SelectItem value="es">Espagnol</SelectItem>
              <SelectItem value="de">Allemand</SelectItem>
              <SelectItem value="it">Italien</SelectItem>
              <SelectItem value="pt">Portugais</SelectItem>
              <SelectItem value="ar">Arabe</SelectItem>
              <SelectItem value="zh">Chinois</SelectItem>
              <SelectItem value="ja">Japonais</SelectItem>
              <SelectItem value="ru">Russe</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Nombre de pages */}
        <div>
          <Label htmlFor="pages">Nombre de pages</Label>
          <Input
            id="pages"
            type="number"
            value={formData.pages}
            onChange={(e) => handleInputChange("pages", e.target.value)}
            min="1"
            placeholder="Ex: 250"
            className={errors.pages ? "border-red-500" : ""}
          />
          {errors.pages && (
            <p className="text-red-500 text-sm mt-1">{errors.pages}</p>
          )}
        </div>

        {/* Année de publication */}
        <div>
          <Label htmlFor="publication_year">Année de publication</Label>
          <Input
            id="publication_year"
            type="number"
            value={formData.publication_year}
            onChange={(e) => handleInputChange("publication_year", e.target.value)}
            min="1000"
            max={new Date().getFullYear()}
            placeholder="Ex: 2020"
            className={errors.publication_year ? "border-red-500" : ""}
          />
          {errors.publication_year && (
            <p className="text-red-500 text-sm mt-1">{errors.publication_year}</p>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleInputChange("description", e.target.value)}
          placeholder="Description ou résumé du livre..."
          rows={3}
        />
      </div>

      {/* Boutons d'action */}
      <div className="flex justify-end space-x-3 pt-4 border-t">
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => onSuccess()}
          disabled={loading}
        >
          <X className="h-4 w-4 mr-2" />
          Annuler
        </Button>
        <Button type="submit" disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? "Sauvegarde..." : book ? "Modifier" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
};

export default BookForm;