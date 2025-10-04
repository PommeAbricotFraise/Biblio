import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKeyboardShortcuts } from "@/hooks/useKeyboard";
import AdvancedSearch from "@/components/AdvancedSearch";
import { EnhancedInput } from "@/components/ui/input-enhanced";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  BookOpen,
  Download,
  ScanLine,
  Sparkles,
  Heart,
  Star
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import BookForm from "@/components/BookForm";
import ISBNLookup from "@/components/ISBNLookup";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BookList = ({ books = [], placards = [], shelves = [], refreshData, currentSchool }) => {
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlacard, setSelectedPlacard] = useState("__all__");
  const [selectedShelf, setSelectedShelf] = useState("__all__");
  const [sortBy, setSortBy] = useState("title");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isISBNDialogOpen, setIsISBNDialogOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [advancedSearchResults, setAdvancedSearchResults] = useState(null);

  // Auto-complétion pour les champs
  const authorSuggestions = useMemo(() => 
    [...new Set(books.map(book => book.author).filter(Boolean))],
    [books]
  );

  // Raccourcis clavier
  useKeyboardShortcuts({
    'ctrl+n': () => setIsAddDialogOpen(true),
    'ctrl+f': () => document.getElementById('search-input')?.focus(),
    'ctrl+shift+f': () => {}, // Sera géré par AdvancedSearch
    'escape': () => {
      setIsAddDialogOpen(false);
      setIsEditDialogOpen(false);
      setIsISBNDialogOpen(false);
      setAdvancedSearchResults(null);
    }
  });

  // Obtenir le label d'un type de rangement
  const getStorageLabel = (storageType) => {
    const labels = {
      "placard": "📁 Placard",
      "bac": "📦 Bac", 
      "mur": "🧱 Mur",
      "etagere_mobile": "🛒 Étagère mobile",
      "bibliotheque": "📚 Bibliothèque",
      "autre": "📋 Autre"
    };
    return labels[storageType] || "📁 Placard";
  };

  // Couleurs aléatoires pour les livres
  const bookColors = [
    'bg-gradient-to-r from-blue-400 to-blue-600',
    'bg-gradient-to-r from-green-400 to-green-600',
    'bg-gradient-to-r from-purple-400 to-purple-600',
    'bg-gradient-to-r from-pink-400 to-pink-600',
    'bg-gradient-to-r from-indigo-400 to-indigo-600',
    'bg-gradient-to-r from-red-400 to-red-600',
    'bg-gradient-to-r from-yellow-400 to-yellow-600',
    'bg-gradient-to-r from-teal-400 to-teal-600'
  ];

  // Filtrer et trier les livres
  useEffect(() => {
    // Si on a des résultats de recherche avancée, on les utilise comme base
    let filtered = advancedSearchResults ? [...advancedSearchResults] : [...books];

    // Filtrage par terme de recherche (seulement si pas de recherche avancée active)
    if (searchTerm && !advancedSearchResults && !searchTerm.startsWith('Recherche avancée')) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(book => 
        book.title.toLowerCase().includes(term) ||
        book.author.toLowerCase().includes(term) ||
        book.isbn?.toLowerCase().includes(term) ||
        book.edition?.toLowerCase().includes(term)
      );
    }

    // Filtrage par placard (seulement si pas de recherche avancée active)
    if (selectedPlacard && selectedPlacard !== "__all__" && !advancedSearchResults) {
      filtered = filtered.filter(book => book.placard === selectedPlacard);
    }

    // Filtrage par étagère (seulement si pas de recherche avancée active)
    if (selectedShelf && selectedShelf !== "__all__" && !advancedSearchResults) {
      filtered = filtered.filter(book => book.shelf === selectedShelf);
    }

    // Tri
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'author':
          return a.author.localeCompare(b.author);
        case 'date_added':
          return new Date(b.date_added) - new Date(a.date_added);
        case 'last_modified':
          return new Date(b.last_modified) - new Date(a.last_modified);
        default:
          return a.title.localeCompare(b.title);
      }
    });

    setFilteredBooks(filtered);
  }, [books, searchTerm, selectedPlacard, selectedShelf, sortBy, advancedSearchResults]);

  // Supprimer un livre
  const handleDeleteBook = async (bookId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce livre ? 🗑️')) {
      return;
    }

    try {
      await axios.delete(`${API}/books/${bookId}`);
      toast.success("📚 Livre supprimé avec succès !");
      refreshData();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      toast.error("❌ Erreur lors de la suppression du livre");
    }
  };

  // Modifier un livre
  const handleEditBook = (book) => {
    setSelectedBook(book);
    setIsEditDialogOpen(true);
  };

  // Réinitialiser les filtres
  const resetFilters = () => {
    setSearchTerm("");
    setSelectedPlacard("__all__");
    setSelectedShelf("__all__");
    setSortBy("title");
    setAdvancedSearchResults(null);
  };

  // Export Excel avec filtres actuels
  const handleExportFiltered = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedPlacard && selectedPlacard !== "__all__") params.append('placard', selectedPlacard);
      if (selectedShelf && selectedShelf !== "__all__") params.append('shelf', selectedShelf);

      const response = await axios.get(`${API}/export/excel?${params.toString()}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `mes_livres_${new Date().getTime()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("🎉 Liste de livres téléchargée !");
    } catch (error) {
      console.error("Erreur lors de l'export:", error);
      toast.error("❌ Erreur lors du téléchargement");
    } finally {
      setLoading(false);
    }
  };

  // Obtenir une couleur pour un livre
  const getBookColor = (bookId) => {
    const index = bookId ? bookId.charCodeAt(0) % bookColors.length : 0;
    return bookColors[index];
  };

  return (
    <div className="space-y-8 p-6">
      {/* Header coloré et attirant */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <BookOpen className="h-12 w-12 text-blue-500 mr-3" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Tous Mes Livres
          </h1>
          <Heart className="h-8 w-8 text-red-500 ml-3" />
        </div>
        <p className="text-xl text-gray-600 mb-6">
          🎯 {filteredBooks.length} livre{filteredBooks.length > 1 ? 's' : ''} 
          {filteredBooks.length !== books.length ? ` sur ${books.length} au total` : ''} dans ma collection
        </p>
        
        {/* Boutons d'actions colorés */}
        <div className="flex flex-wrap justify-center gap-4">
          <Button
            className="button-primary hover-lift px-6 py-3 text-lg"
            onClick={handleExportFiltered}
            disabled={loading || filteredBooks.length === 0}
          >
            <Download className="h-5 w-5 mr-2" />
            📋 Télécharger ma liste
          </Button>
          
          <Dialog open={isISBNDialogOpen} onOpenChange={setIsISBNDialogOpen}>
            <DialogTrigger asChild>
              <Button className="button-success hover-lift px-6 py-3 text-lg">
                <ScanLine className="h-5 w-5 mr-2" />
                📖 Recherche ISBN
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center">
                  <Search className="h-6 w-6 mr-2 text-blue-600" />
                  Ajouter un livre avec son ISBN
                </DialogTitle>
                <DialogDescription className="text-lg">
                  Scannez ou tapez l'ISBN pour ajouter automatiquement un livre 📚
                </DialogDescription>
              </DialogHeader>
              <ISBNLookup 
                placards={placards} 
                shelves={shelves} 
                onSuccess={() => {
                  setIsISBNDialogOpen(false);
                  refreshData();
                }}
              />
            </DialogContent>
          </Dialog>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white hover-lift px-6 py-3 text-lg">
                <Plus className="h-5 w-5 mr-2" />
                ✏️ Ajouter un livre
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center">
                  <Plus className="h-6 w-6 mr-2 text-green-600" />
                  Ajouter un nouveau livre
                </DialogTitle>
                <DialogDescription className="text-lg">
                  Remplissez les informations de votre livre 📝
                </DialogDescription>
              </DialogHeader>
              <BookForm
                placards={placards}
                shelves={shelves}
                onSuccess={() => {
                  setIsAddDialogOpen(false);
                  refreshData();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filtres simplifiés et colorés */}
      <Card className="library-card hover-lift">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
            {/* Barre de recherche améliorée */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400" />
              <EnhancedInput
                id="search-input"
                placeholder="🔍 Rechercher un livre... (Ctrl+F)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                suggestions={authorSuggestions}
                className="form-input pl-12 text-lg"
              />
            </div>
            
            {/* Recherche avancée */}
            <div className="flex gap-2 items-center">
              <AdvancedSearch 
                books={advancedSearchResults || books}
                placards={placards}
                shelves={shelves}
                onResults={(results) => {
                  setAdvancedSearchResults(results);
                  setSearchTerm(`Recherche avancée (${results.length} résultats)`);
                }}
              />
              {advancedSearchResults && (
                <Button
                  onClick={() => {
                    setAdvancedSearchResults(null);
                    setSearchTerm("");
                  }}
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                >
                  ❌ Effacer filtres
                </Button>
              )}
            </div>

            {/* Filtre par rangement */}
            <select 
              value={selectedPlacard} 
              onChange={(e) => setSelectedPlacard(e.target.value)}
              className="form-input text-lg px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="__all__">🏗️ Tous les rangements</option>
              {placards.map(placard => (
                <option key={placard.id} value={placard.name}>
                  {getStorageLabel(placard.storage_type)} {placard.name}
                </option>
              ))}
            </select>

            {/* Filtre par étagère */}
            <select 
              value={selectedShelf} 
              onChange={(e) => setSelectedShelf(e.target.value)}
              className="form-input text-lg px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="__all__">📚 Toutes les étagères</option>
              {shelves
                .filter(shelf => selectedPlacard === "__all__" || shelf.placard_name === selectedPlacard)
                .map(shelf => (
                  <option key={shelf.id} value={shelf.name}>
                    📋 Étagère {shelf.name}
                  </option>
                ))}
            </select>

            {/* Tri */}
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="form-input text-lg px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="title">📖 Par titre</option>
              <option value="author">✍️ Par auteur</option>
              <option value="date_added">🆕 Plus récents</option>
            </select>
          </div>

          <div className="flex justify-center">
            <Button 
              onClick={resetFilters}
              className="button-primary hover-lift"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              ✨ Tout afficher
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tableau des livres simplifié et coloré */}
      <Card className="library-card hover-lift">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-purple-100 to-pink-100">
                  <TableHead className="text-lg font-bold text-purple-800">📚 Livre</TableHead>
                  <TableHead className="text-lg font-bold text-purple-800">✍️ Auteur</TableHead>
                  <TableHead className="text-lg font-bold text-purple-800">📍 Emplacement</TableHead>
                  <TableHead className="text-lg font-bold text-purple-800">📊 Exemplaires</TableHead>
                  <TableHead className="text-lg font-bold text-purple-800 text-right">⚙️ Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBooks.map((book, index) => (
                  <TableRow 
                    key={book.id} 
                    data-testid={`book-row-${book.id}`}
                    className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-200"
                  >
                    <TableCell>
                      <div className="flex items-center space-x-4">
                        <div className={`w-4 h-12 rounded ${getBookColor(book.id)} book-hover`} />
                        <div>
                          <div className="font-bold text-lg text-gray-800">{book.title}</div>
                          {book.edition && (
                            <div className="text-sm text-purple-600">📖 {book.edition}</div>
                          )}
                          {book.isbn && (
                            <div className="text-xs text-gray-500">🔢 ISBN: {book.isbn}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Star className="h-4 w-4 text-yellow-500 mr-2" />
                        <span className="font-semibold text-lg">{book.author}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center">
                          <span className="badge-blue px-3 py-1 rounded-full text-sm">
                            {(() => {
                              const placard = placards.find(p => p.name === book.placard);
                              return getStorageLabel(placard?.storage_type);
                            })()} {book.placard}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="badge-green px-3 py-1 rounded-full text-sm">
                            📋 Étagère {book.shelf}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="text-3xl font-bold text-purple-600">{book.count}</div>
                      <div className="text-sm text-gray-500">exemplaire{book.count > 1 ? 's' : ''}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button
                          size="sm"
                          onClick={() => handleEditBook(book)}
                          className="button-success hover-lift"
                          data-testid={`edit-book-${book.id}`}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          ✏️
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleDeleteBook(book.id)}
                          className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white hover-lift"
                          data-testid={`delete-book-${book.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          🗑️
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {filteredBooks.length === 0 && (
            <div className="text-center py-16">
              <BookOpen className="h-20 w-20 text-purple-300 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-gray-600 mb-2">
                {books.length === 0 
                  ? "Aucun livre dans votre bibliothèque" 
                  : "Aucun livre ne correspond à votre recherche"
                }
              </h3>
              <p className="text-lg text-gray-500">
                {books.length === 0 
                  ? "Commencez par ajouter votre premier livre ! 📚" 
                  : "Essayez de modifier vos filtres de recherche 🔍"
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog pour modifier un livre */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center">
              <Edit className="h-6 w-6 mr-2 text-blue-600" />
              Modifier le livre
            </DialogTitle>
            <DialogDescription className="text-lg">
              Modifiez les informations de votre livre ✏️
            </DialogDescription>
          </DialogHeader>
          {selectedBook && (
            <BookForm
              book={selectedBook}
              placards={placards}
              shelves={shelves}
              onSuccess={() => {
                setIsEditDialogOpen(false);
                setSelectedBook(null);
                refreshData();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookList;