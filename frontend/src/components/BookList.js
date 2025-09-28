import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Filter, 
  Edit, 
  Trash2, 
  BookOpen,
  Download,
  ScanLine,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import BookForm from "@/components/BookForm";
import ISBNLookup from "@/components/ISBNLookup";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BookList = ({ books = [], placards = [], shelves = [], refreshData }) => {
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlacard, setSelectedPlacard] = useState("");
  const [selectedShelf, setSelectedShelf] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [sortBy, setSortBy] = useState("title");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isISBNDialogOpen, setIsISBNDialogOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [loading, setLoading] = useState(false);

  // Categories uniques extraites des livres
  const categories = useMemo(() => {
    const cats = [...new Set(books.map(book => book.category || 'Général').filter(Boolean))];
    return cats.sort();
  }, [books]);

  // Statuts disponibles
  const statuses = ['disponible', 'emprunté', 'perdu', 'en_maintenance'];

  // Filtrer et trier les livres
  useEffect(() => {
    let filtered = [...books];

    // Filtrage par terme de recherche
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(book => 
        book.title.toLowerCase().includes(term) ||
        book.author.toLowerCase().includes(term) ||
        book.isbn?.toLowerCase().includes(term) ||
        book.edition?.toLowerCase().includes(term)
      );
    }

    // Filtrage par placard
    if (selectedPlacard) {
      filtered = filtered.filter(book => book.placard === selectedPlacard);
    }

    // Filtrage par étagère
    if (selectedShelf) {
      filtered = filtered.filter(book => book.shelf === selectedShelf);
    }

    // Filtrage par catégorie
    if (selectedCategory) {
      filtered = filtered.filter(book => book.category === selectedCategory);
    }

    // Filtrage par statut
    if (selectedStatus) {
      filtered = filtered.filter(book => book.status === selectedStatus);
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
        case 'category':
          return (a.category || '').localeCompare(b.category || '');
        default:
          return a.title.localeCompare(b.title);
      }
    });

    setFilteredBooks(filtered);
  }, [books, searchTerm, selectedPlacard, selectedShelf, selectedCategory, selectedStatus, sortBy]);

  // Supprimer un livre
  const handleDeleteBook = async (bookId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce livre ?')) {
      return;
    }

    try {
      await axios.delete(`${API}/books/${bookId}`);
      toast.success("Livre supprimé avec succès !");
      refreshData();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      toast.error("Erreur lors de la suppression du livre");
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
    setSelectedPlacard("");
    setSelectedShelf("");
    setSelectedCategory("");
    setSelectedStatus("");
    setSortBy("title");
  };

  // Export Excel avec filtres actuels
  const handleExportFiltered = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedPlacard) params.append('placard', selectedPlacard);
      if (selectedShelf) params.append('shelf', selectedShelf);
      if (selectedCategory) params.append('category', selectedCategory);
      if (selectedStatus) params.append('status', selectedStatus);

      const response = await axios.get(`${API}/export/excel?${params.toString()}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `livres_filtrés_${new Date().getTime()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Export des livres filtrés téléchargé !");
    } catch (error) {
      console.error("Erreur lors de l'export:", error);
      toast.error("Erreur lors de l'export");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'disponible':
        return 'text-green-600 bg-green-100';
      case 'emprunté':
        return 'text-orange-600 bg-orange-100';
      case 'perdu':
        return 'text-red-600 bg-red-100';
      case 'en_maintenance':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'disponible':
        return <CheckCircle className="h-4 w-4" />;
      case 'emprunté':
        return <BookOpen className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestion des Livres</h1>
          <p className="text-gray-600">
            {filteredBooks.length} livre{filteredBooks.length > 1 ? 's' : ''} 
            {filteredBooks.length !== books.length ? ` sur ${books.length} au total` : ''}
          </p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={handleExportFiltered}
            disabled={loading || filteredBooks.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={isISBNDialogOpen} onOpenChange={setIsISBNDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <ScanLine className="h-4 w-4 mr-2" />
                ISBN
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Recherche par ISBN</DialogTitle>
                <DialogDescription>
                  Recherchez un livre par son ISBN pour l'ajouter automatiquement
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
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un livre
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Ajouter un nouveau livre</DialogTitle>
                <DialogDescription>
                  Remplissez les informations du livre à ajouter
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

      {/* Filtres et recherche */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Barre de recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher un livre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filtre par placard */}
            <Select value={selectedPlacard} onValueChange={setSelectedPlacard}>
              <SelectTrigger>
                <SelectValue placeholder="Tous les placards" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les placards</SelectItem>
                {placards.map(placard => (
                  <SelectItem key={placard.id} value={placard.name}>
                    Placard {placard.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtre par étagère */}
            <Select value={selectedShelf} onValueChange={setSelectedShelf}>
              <SelectTrigger>
                <SelectValue placeholder="Toutes les étagères" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les étagères</SelectItem>
                {shelves
                  .filter(shelf => selectedPlacard === "" || selectedPlacard === "all" || shelf.placard_name === selectedPlacard)
                  .map(shelf => (
                    <SelectItem key={shelf.id} value={shelf.name}>
                      Étagère {shelf.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* Filtre par catégorie */}
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Toutes les catégories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {/* Filtre par statut */}
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous les statuts</SelectItem>
                  {statuses.map(status => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Tri */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">Titre</SelectItem>
                  <SelectItem value="author">Auteur</SelectItem>
                  <SelectItem value="category">Catégorie</SelectItem>
                  <SelectItem value="date_added">Date d'ajout</SelectItem>
                  <SelectItem value="last_modified">Dernière modif.</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" onClick={resetFilters}>
              <Filter className="h-4 w-4 mr-2" />
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tableau des livres */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titre</TableHead>
                  <TableHead>Auteur</TableHead>
                  <TableHead>Édition</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Emplacement</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Exemplaires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBooks.map((book) => (
                  <TableRow key={book.id} data-testid={`book-row-${book.id}`}>
                    <TableCell className="font-medium">
                      <div>
                        <div className="font-semibold">{book.title}</div>
                        {book.isbn && (
                          <div className="text-xs text-gray-500">ISBN: {book.isbn}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{book.author}</TableCell>
                    <TableCell>{book.edition || '-'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {book.category || 'Général'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>Placard {book.placard}</div>
                        <div className="text-gray-500">Étagère {book.shelf}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(book.status)}`}>
                        {getStatusIcon(book.status)}
                        <span className="ml-1">{book.status}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{book.count}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditBook(book)}
                          data-testid={`edit-book-${book.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteBook(book.id)}
                          className="text-red-600 hover:text-red-800"
                          data-testid={`delete-book-${book.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {filteredBooks.length === 0 && (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {books.length === 0 
                  ? "Aucun livre dans la bibliothèque" 
                  : "Aucun livre ne correspond aux critères de recherche"
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog pour modifier un livre */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier le livre</DialogTitle>
            <DialogDescription>
              Modifiez les informations du livre
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