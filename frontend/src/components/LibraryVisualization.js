import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Layout, 
  RefreshCw, 
  ZoomIn, 
  ZoomOut, 
  Archive, 
  Book, 
  Eye,
  Grid3x3,
  BarChart3
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LibraryVisualization = ({ refreshData }) => {
  const [visualizationData, setVisualizationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlacard, setSelectedPlacard] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState('visual'); // 'visual' ou 'grid'

  // Couleurs pour les catégories de livres
  const categoryColors = {
    'Littérature': '#3B82F6',     // Bleu
    'Science': '#10B981',         // Vert
    'Histoire': '#F59E0B',        // Orange
    'Art': '#8B5CF6',             // Violet
    'Jeunesse': '#EF4444',        // Rouge
    'BD/Comics': '#06B6D4',       // Cyan
    'Général': '#6B7280',         // Gris
  };

  // Couleurs pour les statuts
  const statusColors = {
    'disponible': '#10B981',      // Vert
    'emprunté': '#F59E0B',        // Orange
    'perdu': '#EF4444',           // Rouge
    'en_maintenance': '#6B7280'   // Gris
  };

  // Charger les données de visualisation
  const fetchVisualizationData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/visualization`);
      setVisualizationData(response.data);
      
      // Sélectionner le premier placard par défaut
      const firstPlacard = Object.keys(response.data)[0];
      if (firstPlacard) {
        setSelectedPlacard(firstPlacard);
      }
    } catch (error) {
      console.error("Erreur lors du chargement de la visualisation:", error);
      toast.error("Erreur lors du chargement de la visualisation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisualizationData();
  }, []);

  // Obtenir la couleur d'un livre selon sa catégorie
  const getBookColor = (book, colorBy = 'category') => {
    if (colorBy === 'status') {
      return statusColors[book.status] || statusColors['disponible'];
    }
    return categoryColors[book.category] || categoryColors['Général'];
  };

  // Rendu d'une étagère en mode visuel
  const renderShelfVisual = (shelf, shelfData) => {
    const maxBooksPerRow = 20;
    const books = shelfData.books || [];
    
    return (
      <div key={shelf} className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-gray-800">
            Étagère {shelf}
            <span className="ml-2 text-sm text-gray-500">
              ({shelfData.book_count} livres)
            </span>
          </h4>
        </div>
        
        <div 
          className="border-2 border-gray-300 rounded-lg p-3 bg-gradient-to-b from-gray-50 to-gray-100 min-h-[80px]"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
        >
          {books.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <span>Étagère vide</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {books.map((book, index) => (
                <div
                  key={`${book.id}-${index}`}
                  className="relative group"
                  title={`${book.title} - ${book.author} (${book.count} ex.)`}
                >
                  {/* Représentation visuelle du livre */}
                  <div
                    className="w-6 h-16 rounded-sm shadow-sm border border-gray-400 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-110"
                    style={{
                      backgroundColor: getBookColor(book),
                      background: `linear-gradient(to bottom, ${getBookColor(book)}, ${getBookColor(book)}dd)`
                    }}
                  >
                    {/* Indication du nombre d'exemplaires */}
                    {book.count > 1 && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                        {book.count}
                      </div>
                    )}
                  </div>
                  
                  {/* Tooltip au survol */}
                  <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap">
                    <div className="font-semibold">{book.title}</div>
                    <div>par {book.author}</div>
                    <div className="text-gray-300">{book.count} exemplaire{book.count > 1 ? 's' : ''}</div>
                    <div className="text-gray-300 capitalize">{book.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Rendu d'une étagère en mode grille
  const renderShelfGrid = (shelf, shelfData) => {
    const books = shelfData.books || [];
    
    return (
      <Card key={shelf} className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Étagère {shelf}</span>
            <span className="text-sm font-normal text-gray-500">
              {shelfData.book_count} livres
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {books.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Étagère vide</p>
          ) : (
            <div className="space-y-2">
              {books.map((book) => (
                <div key={book.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: getBookColor(book) }}
                    />
                    <div>
                      <div className="font-medium">{book.title}</div>
                      <div className="text-sm text-gray-500">{book.author}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 text-sm">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {book.category}
                    </span>
                    <span className={`px-2 py-1 rounded text-white`} 
                          style={{ backgroundColor: statusColors[book.status] }}>
                      {book.status}
                    </span>
                    <span className="font-medium">{book.count} ex.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-500">Chargement de la visualisation...</p>
        </div>
      </div>
    );
  }

  if (!visualizationData || Object.keys(visualizationData).length === 0) {
    return (
      <div className="text-center py-12">
        <Archive className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune donnée de visualisation</h3>
        <p className="text-gray-500">La bibliothèque semble être vide.</p>
      </div>
    );
  }

  const currentPlacardData = selectedPlacard ? visualizationData[selectedPlacard] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Visualisation de la Bibliothèque</h1>
          <p className="text-gray-600">Plan interactif et organisation spatiale</p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant={viewMode === 'visual' ? 'default' : 'outline'}
            onClick={() => setViewMode('visual')}
            size="sm"
          >
            <Eye className="h-4 w-4 mr-2" />
            Vue 3D
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            onClick={() => setViewMode('grid')}
            size="sm"
          >
            <Grid3x3 className="h-4 w-4 mr-2" />
            Liste
          </Button>
          <Button 
            onClick={fetchVisualizationData}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sélecteur de placard */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Placards</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(visualizationData).map(([placardName, placardData]) => (
                <button
                  key={placardName}
                  onClick={() => setSelectedPlacard(placardName)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedPlacard === placardName
                      ? 'bg-blue-50 border-blue-200 text-blue-900'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Archive className="h-4 w-4" />
                      <span className="font-medium">Placard {placardName}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {placardData.total_books} livres
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {Object.keys(placardData.shelves || {}).length} étagères
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Légende */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Légende</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h4 className="font-medium mb-2">Par catégorie</h4>
                <div className="space-y-1">
                  {Object.entries(categoryColors).map(([category, color]) => (
                    <div key={category} className="flex items-center space-x-2">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm">{category}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="border-t pt-3">
                <h4 className="font-medium mb-2">Par statut</h4>
                <div className="space-y-1">
                  {Object.entries(statusColors).map(([status, color]) => (
                    <div key={status} className="flex items-center space-x-2">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm capitalize">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Visualisation principale */}
        <div className="lg:col-span-3">
          {currentPlacardData ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      <Archive className="h-5 w-5 mr-2" />
                      Placard {selectedPlacard}
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      {currentPlacardData.total_books} livres répartis sur {Object.keys(currentPlacardData.shelves || {}).length} étagères
                    </p>
                  </div>
                  
                  {viewMode === 'visual' && (
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                        disabled={zoom <= 0.5}
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setZoom(Math.min(2, zoom + 0.25))}
                        disabled={zoom >= 2}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(currentPlacardData.shelves || {})
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([shelfName, shelfData]) => 
                      viewMode === 'visual' 
                        ? renderShelfVisual(shelfName, shelfData)
                        : renderShelfGrid(shelfName, shelfData)
                    )}
                </div>

                {Object.keys(currentPlacardData.shelves || {}).length === 0 && (
                  <div className="text-center py-12">
                    <Book className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Ce placard ne contient aucune étagère</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Layout className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Sélectionnez un placard pour voir sa visualisation</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Archive className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Placards</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(visualizationData).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Étagères</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.values(visualizationData).reduce(
                    (total, placard) => total + Object.keys(placard.shelves || {}).length, 0
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Book className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Livres</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.values(visualizationData).reduce(
                    (total, placard) => total + placard.total_books, 0
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LibraryVisualization;