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
  Sparkles,
  Heart
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

  // Couleurs attrayantes pour les livres (plus de variété)
  const bookColors = [
    'book-blue',    // Bleu
    'book-green',   // Vert
    'book-pink',    // Rose
    'book-orange',  // Orange
    'book-purple',  // Violet
    'book-red',     // Rouge
  ];

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
      toast.error("❌ Erreur lors du chargement de la visualisation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisualizationData();
  }, []);

  // Obtenir la couleur d'un livre aléatoirement
  const getBookColor = (bookId) => {
    const index = bookId ? bookId.charCodeAt(0) % bookColors.length : 0;
    return bookColors[index];
  };

  // Rendu d'une étagère en mode visuel
  const renderShelfVisual = (shelf, shelfData) => {
    const books = shelfData.books || [];
    
    return (
      <div key={shelf} className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xl font-bold text-purple-800 flex items-center">
            📋 Étagère {shelf}
            <span className="ml-3 text-lg text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
              {shelfData.book_count} livre{shelfData.book_count > 1 ? 's' : ''}
            </span>
          </h4>
        </div>
        
        <div 
          className="shelf-container p-4 min-h-[140px]"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
        >
          {books.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-lg">
              <Book className="h-8 w-8 mr-2" />
              <span>Étagère vide - Prête pour de nouveaux livres ! 📚</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {books.map((book, index) => (
                <div
                  key={`${book.id}-${index}`}
                  className="relative group hover-lift"
                  title={`${book.title} - ${book.author} (${book.count} ex.)`}
                >
                  {/* Représentation visuelle du livre avec titre */}
                  <div
                    className={`w-16 h-24 rounded-lg shadow-lg border-2 border-white cursor-pointer transition-all duration-300 hover:scale-110 ${getBookColor(book.id)} flex items-center justify-center text-center p-1 overflow-hidden`}
                  >
                    {/* Titre du livre dans le rectangle */}
                    <div className="text-white text-xs font-bold leading-tight break-words">
                      {book.title.length > 20 ? book.title.substring(0, 18) + '...' : book.title}
                    </div>
                    
                    {/* Indication du nombre d'exemplaires */}
                    {book.count > 1 && (
                      <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold shadow-lg">
                        {book.count}
                      </div>
                    )}
                  </div>
                  
                  {/* Tooltip au survol */}
                  <div className="absolute bottom-full mb-3 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-sm rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 whitespace-nowrap shadow-xl">
                    <div className="font-bold text-yellow-300">📖 {book.title}</div>
                    <div className="text-blue-200">✍️ par {book.author}</div>
                    <div className="text-green-200">📊 {book.count} exemplaire{book.count > 1 ? 's' : ''}</div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
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
      <Card key={shelf} className="library-card hover-lift mb-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center justify-between">
            <span className="flex items-center">
              📋 <span className="text-purple-700 ml-2">Étagère {shelf}</span>
            </span>
            <span className="text-lg font-normal bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-full">
              {shelfData.book_count} livre{shelfData.book_count > 1 ? 's' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {books.length === 0 ? (
            <div className="text-center py-8">
              <Book className="h-16 w-16 text-purple-300 mx-auto mb-4" />
              <p className="text-lg text-gray-500">Cette étagère attend de nouveaux livres ! 📚</p>
            </div>
          ) : (
            <div className="space-y-3">
              {books.map((book) => (
                <div key={book.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl hover-lift">
                  <div className="flex items-center space-x-4">
                    <div className={`w-6 h-6 rounded-full ${getBookColor(book.id)}`} />
                    <div>
                      <div className="font-bold text-lg text-gray-800">📖 {book.title}</div>
                      <div className="text-gray-600">✍️ {book.author}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-purple-600">{book.count}</div>
                    <div className="text-sm text-gray-500">exemplaire{book.count > 1 ? 's' : ''}</div>
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
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-xl font-semibold text-gray-700">Chargement de votre plan de bibliothèque...</p>
        </div>
      </div>
    );
  }

  if (!visualizationData || Object.keys(visualizationData).length === 0) {
    return (
      <div className="text-center py-16">
        <Archive className="h-24 w-24 text-purple-300 mx-auto mb-6" />
        <h3 className="text-2xl font-bold text-gray-700 mb-4">Aucune donnée de visualisation</h3>
        <p className="text-xl text-gray-500">Votre bibliothèque semble être vide. Ajoutez des livres pour voir la visualisation ! 📚</p>
      </div>
    );
  }

  const currentPlacardData = selectedPlacard ? visualizationData[selectedPlacard] : null;

  return (
    <div className="space-y-8 p-6">
      {/* Header coloré et attirant */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <Layout className="h-12 w-12 text-purple-600 mr-3" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Plan de Ma Bibliothèque
          </h1>
          <Sparkles className="h-10 w-10 text-yellow-500 ml-3" />
        </div>
        <p className="text-xl text-gray-600">Découvrez où se trouvent tous vos livres ! 🗺️</p>
        
        <div className="flex flex-wrap justify-center gap-4 mt-6">
          <Button
            className={`hover-lift px-6 py-3 text-lg ${viewMode === 'visual' ? 'button-primary' : 'bg-gradient-to-r from-gray-400 to-gray-500 text-white'}`}
            onClick={() => setViewMode('visual')}
          >
            <Eye className="h-5 w-5 mr-2" />
            🎨 Vue 3D
          </Button>
          <Button
            className={`hover-lift px-6 py-3 text-lg ${viewMode === 'grid' ? 'button-primary' : 'bg-gradient-to-r from-gray-400 to-gray-500 text-white'}`}
            onClick={() => setViewMode('grid')}
          >
            <Grid3x3 className="h-5 w-5 mr-2" />
            📝 Vue Liste
          </Button>
          <Button 
            onClick={fetchVisualizationData}
            className="button-success hover-lift px-6 py-3 text-lg"
          >
            <RefreshCw className="h-5 w-5 mr-2" />
            🔄 Actualiser
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sélecteur de placard */}
        <div className="lg:col-span-1">
          <Card className="library-card hover-lift">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-purple-800 flex items-center">
                <Archive className="h-6 w-6 mr-2" />
                🗄️ Mes Placards
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(visualizationData).map(([placardName, placardData]) => (
                <button
                  key={placardName}
                  onClick={() => setSelectedPlacard(placardName)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-300 hover-lift ${
                    selectedPlacard === placardName
                      ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white border-purple-400 shadow-lg'
                      : 'bg-gradient-to-r from-blue-50 to-purple-50 border-purple-200 hover:from-purple-100 hover:to-pink-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <Archive className="h-6 w-6" />
                      <span className="font-bold text-lg">Placard {placardName}</span>
                    </div>
                    <Heart className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>📚 {placardData.total_books} livres</div>
                    <div>📋 {Object.keys(placardData.shelves || {}).length} étagères</div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Légende simplifiée */}
          <Card className="library-card hover-lift mt-6">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-purple-800">🌈 Légende</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-bold mb-3 text-gray-700">📚 Informations :</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-gradient-to-r from-blue-400 to-blue-600 rounded" />
                    <span>Chaque rectangle = 1 livre</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">2</div>
                    <span>Chiffre rouge = nombre d'exemplaires</span>
                  </div>
                </div>
              </div>
              
              <div className="border-t-2 border-purple-200 pt-4">
                <h4 className="font-bold mb-2 text-gray-700">💡 Astuces :</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Survolez un livre pour plus d'informations</div>
                  <div>• Le titre du livre est affiché dans le rectangle</div>
                  <div>• Utilisez le zoom pour mieux voir</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Visualisation principale */}
        <div className="lg:col-span-3">
          {currentPlacardData ? (
            <Card className="library-card hover-lift">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl font-bold flex items-center text-purple-800">
                      <Archive className="h-8 w-8 mr-3" />
                      🗄️ Placard {selectedPlacard}
                    </CardTitle>
                    <p className="text-lg text-gray-600 mt-2">
                      📚 {currentPlacardData.total_books} livres répartis sur {Object.keys(currentPlacardData.shelves || {}).length} étagère{Object.keys(currentPlacardData.shelves || {}).length > 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  {viewMode === 'visual' && (
                    <div className="flex space-x-3 mt-4 lg:mt-0">
                      <Button
                        onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                        disabled={zoom <= 0.5}
                        className="button-success"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <span className="flex items-center text-lg font-semibold text-purple-600">
                        🔍 {Math.round(zoom * 100)}%
                      </span>
                      <Button
                        onClick={() => setZoom(Math.min(2, zoom + 0.25))}
                        disabled={zoom >= 2}
                        className="button-success"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {Object.entries(currentPlacardData.shelves || {})
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([shelfName, shelfData]) => 
                      viewMode === 'visual' 
                        ? renderShelfVisual(shelfName, shelfData)
                        : renderShelfGrid(shelfName, shelfData)
                    )}
                </div>

                {Object.keys(currentPlacardData.shelves || {}).length === 0 && (
                  <div className="text-center py-16">
                    <Book className="h-20 w-20 text-purple-300 mx-auto mb-6" />
                    <h3 className="text-2xl font-bold text-gray-600 mb-2">Ce placard est vide</h3>
                    <p className="text-lg text-gray-500">Ajoutez des étagères et des livres pour commencer ! 📚</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="library-card hover-lift">
              <CardContent className="py-16 text-center">
                <Layout className="h-20 w-20 text-purple-300 mx-auto mb-6" />
                <h3 className="text-2xl font-bold text-gray-600 mb-2">Sélectionnez un placard</h3>
                <p className="text-lg text-gray-500">Choisissez un placard à gauche pour voir sa visualisation ! 👈</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Statistiques rapides colorées */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="stats-card-blue hover-lift">
          <CardContent className="pt-6 text-center">
            <Archive className="h-12 w-12 text-white mx-auto mb-4" />
            <p className="text-lg font-bold opacity-90">Total Placards</p>
            <p className="text-4xl font-bold">
              {Object.keys(visualizationData).length}
            </p>
          </CardContent>
        </Card>

        <Card className="stats-card-green hover-lift">
          <CardContent className="pt-6 text-center">
            <Layout className="h-12 w-12 text-white mx-auto mb-4" />
            <p className="text-lg font-bold opacity-90">Total Étagères</p>
            <p className="text-4xl font-bold">
              {Object.values(visualizationData).reduce(
                (total, placard) => total + Object.keys(placard.shelves || {}).length, 0
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="stats-card-purple hover-lift">
          <CardContent className="pt-6 text-center">
            <Book className="h-12 w-12 text-white mx-auto mb-4" />
            <p className="text-lg font-bold opacity-90">Total Livres</p>
            <p className="text-4xl font-bold">
              {Object.values(visualizationData).reduce(
                (total, placard) => total + placard.total_books, 0
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LibraryVisualization;