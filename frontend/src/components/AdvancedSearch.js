import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Search, Filter, X } from 'lucide-react';
import { EnhancedInput } from '@/components/ui/input-enhanced';

const AdvancedSearch = ({ books, placards, shelves, onResults, onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState({
    title: '',
    author: '',
    isbn: '',
    placard: '',
    shelf: '',
    yearFrom: '',
    yearTo: '',
    language: '',
    description: ''
  });

  // Suggestions basées sur les données existantes
  const authorSuggestions = [...new Set(books.map(book => book.author).filter(Boolean))];
  const placardSuggestions = placards.map(p => p.name);
  const shelfSuggestions = shelves.map(s => s.name);
  const languageSuggestions = [...new Set(books.map(book => book.language).filter(Boolean))];

  const handleSearch = () => {
    let results = books;

    // Filtrer par titre
    if (filters.title) {
      results = results.filter(book =>
        book.title.toLowerCase().includes(filters.title.toLowerCase())
      );
    }

    // Filtrer par auteur
    if (filters.author) {
      results = results.filter(book =>
        book.author.toLowerCase().includes(filters.author.toLowerCase())
      );
    }

    // Filtrer par ISBN
    if (filters.isbn) {
      results = results.filter(book =>
        book.isbn && book.isbn.includes(filters.isbn)
      );
    }

    // Filtrer par placard
    if (filters.placard) {
      results = results.filter(book => book.placard === filters.placard);
    }

    // Filtrer par étagère
    if (filters.shelf) {
      results = results.filter(book => book.shelf === filters.shelf);
    }

    // Filtrer par année
    if (filters.yearFrom || filters.yearTo) {
      results = results.filter(book => {
        if (!book.publication_year) return false;
        const year = parseInt(book.publication_year);
        if (filters.yearFrom && year < parseInt(filters.yearFrom)) return false;
        if (filters.yearTo && year > parseInt(filters.yearTo)) return false;
        return true;
      });
    }

    // Filtrer par langue
    if (filters.language) {
      results = results.filter(book => book.language === filters.language);
    }

    // Filtrer par description
    if (filters.description) {
      results = results.filter(book =>
        book.description && book.description.toLowerCase().includes(filters.description.toLowerCase())
      );
    }

    onResults(results);
    setIsOpen(false);
  };

  const resetFilters = () => {
    setFilters({
      title: '',
      author: '',
      isbn: '',
      placard: '',
      shelf: '',
      yearFrom: '',
      yearTo: '',
      language: '',
      description: ''
    });
  };

  const getActiveFiltersCount = () => {
    return Object.values(filters).filter(value => value && value.length > 0).length;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white relative">
          <Filter className="h-4 w-4 mr-2" />
          Recherche Avancée
          {getActiveFiltersCount() > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
              {getActiveFiltersCount()}
            </span>
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center">
            <Search className="h-6 w-6 mr-2 text-purple-600" />
            🔍 Recherche Avancée Multi-Critères
          </DialogTitle>
          <DialogDescription className="text-lg">
            Utilisez plusieurs critères pour trouver exactement les livres que vous cherchez
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Informations générales */}
          <Card className="border-blue-200">
            <CardHeader>
              <CardTitle className="text-lg text-blue-700">📖 Informations du livre</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Titre</Label>
                <Input
                  id="title"
                  placeholder="ex: Le Petit Prince"
                  value={filters.title}
                  onChange={(e) => setFilters(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="author">Auteur</Label>
                <EnhancedInput
                  id="author"
                  placeholder="ex: Antoine de Saint-Exupéry"
                  value={filters.author}
                  onChange={(e) => setFilters(prev => ({ ...prev, author: e.target.value }))}
                  suggestions={authorSuggestions}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="isbn">ISBN</Label>
                <Input
                  id="isbn"
                  placeholder="ex: 9782070360130"
                  value={filters.isbn}
                  onChange={(e) => setFilters(prev => ({ ...prev, isbn: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Dans la description</Label>
                <Input
                  id="description"
                  placeholder="Mots-clés dans la description"
                  value={filters.description}
                  onChange={(e) => setFilters(prev => ({ ...prev, description: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Localisation et détails */}
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="text-lg text-green-700">📍 Localisation & Détails</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="placard">Rangement</Label>
                <EnhancedInput
                  id="placard"
                  placeholder="ex: A"
                  value={filters.placard}
                  onChange={(e) => setFilters(prev => ({ ...prev, placard: e.target.value }))}
                  suggestions={placardSuggestions}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="shelf">Étagère</Label>
                <EnhancedInput
                  id="shelf"
                  placeholder="ex: 1"
                  value={filters.shelf}
                  onChange={(e) => setFilters(prev => ({ ...prev, shelf: e.target.value }))}
                  suggestions={shelfSuggestions}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="language">Langue</Label>
                <EnhancedInput
                  id="language"
                  placeholder="ex: fr, en, es"
                  value={filters.language}
                  onChange={(e) => setFilters(prev => ({ ...prev, language: e.target.value }))}
                  suggestions={languageSuggestions}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="yearFrom">Année de</Label>
                  <Input
                    id="yearFrom"
                    type="number"
                    placeholder="1990"
                    value={filters.yearFrom}
                    onChange={(e) => setFilters(prev => ({ ...prev, yearFrom: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="yearTo">Année à</Label>
                  <Input
                    id="yearTo"
                    type="number"
                    placeholder="2024"
                    value={filters.yearTo}
                    onChange={(e) => setFilters(prev => ({ ...prev, yearTo: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Résumé des filtres actifs */}
        {getActiveFiltersCount() > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-yellow-800">
                    🔍 {getActiveFiltersCount()} filtre(s) actif(s)
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(filters).map(([key, value]) => {
                      if (!value) return null;
                      return (
                        <span key={key} className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-sm">
                          {key}: {value}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <Button onClick={resetFilters} variant="outline" size="sm">
                  <X className="h-4 w-4 mr-1" />
                  Effacer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Boutons d'action */}
        <div className="flex justify-end gap-4 pt-4">
          <Button onClick={() => setIsOpen(false)} variant="outline">
            Annuler
          </Button>
          <Button onClick={resetFilters} variant="outline" className="bg-gray-100">
            🧹 Effacer tout
          </Button>
          <Button 
            onClick={handleSearch} 
            className="bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white"
          >
            <Search className="h-4 w-4 mr-2" />
            🔍 Rechercher ({books.length} livres)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdvancedSearch;