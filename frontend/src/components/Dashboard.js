import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Book, 
  Archive, 
  Layers, 
  Download,
  RefreshCw,
  Users,
  Sparkles,
  Heart
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from "recharts";
import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = ({ stats, refreshData }) => {
  const [loading, setLoading] = useState(false);
  
  // Données pour le graphique des placards (plus simple)
  const placardData = stats?.books_by_placard ? 
    Object.entries(stats.books_by_placard).map(([name, value]) => ({ 
      name: `Placard ${name}`, 
      livres: value 
    })) : [];

  const handleExportExcel = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/export/excel`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ma_bibliotheque_${new Date().getTime()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("🎉 Liste de vos livres téléchargée !");
    } catch (error) {
      console.error("Erreur lors de l'export Excel:", error);
      toast.error("Erreur lors du téléchargement");
    } finally {
      setLoading(false);
    }
  };

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-lg font-semibold text-gray-700">Chargement de votre bibliothèque...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header plus attirant */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <Sparkles className="h-12 w-12 text-yellow-500 mr-3" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Bienvenue dans Votre Bibliothèque !
          </h1>
          <Heart className="h-8 w-8 text-red-500 ml-3" />
        </div>
        <p className="text-xl text-gray-600">Découvrez tous vos merveilleux livres</p>
        
        <div className="flex justify-center space-x-4 mt-6">
          <Button 
            onClick={refreshData}
            className="button-primary hover-lift px-6 py-3 text-lg"
            disabled={loading}
          >
            <RefreshCw className="h-5 w-5 mr-2" />
            Actualiser
          </Button>
          <Button 
            onClick={handleExportExcel}
            className="button-success hover-lift px-6 py-3 text-lg"
            disabled={loading}
          >
            <Download className="h-5 w-5 mr-2" />
            {loading ? "Téléchargement..." : "📋 Télécharger ma liste"}
          </Button>
        </div>
      </div>

      {/* Cartes de statistiques colorées et grandes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <Card className="stats-card-blue hover-lift">
          <CardHeader className="text-center pb-2">
            <Book className="icon-large mx-auto mb-2" />
            <CardTitle className="text-lg font-bold text-white">Total de mes Livres</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-5xl font-bold mb-2">{stats.total_books}</div>
            <p className="text-sm opacity-90">
              📚 {stats.recent_additions} nouveaux cette semaine
            </p>
          </CardContent>
        </Card>

        <Card className="stats-card-green hover-lift">
          <CardHeader className="text-center pb-2">
            <Archive className="icon-large mx-auto mb-2" />
            <CardTitle className="text-lg font-bold text-white">Mes Placards</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-5xl font-bold mb-2">{stats.total_placards}</div>
            <p className="text-sm opacity-90">🗄️ Espaces de rangement</p>
          </CardContent>
        </Card>

        <Card className="stats-card-purple hover-lift">
          <CardHeader className="text-center pb-2">
            <Layers className="icon-large mx-auto mb-2" />
            <CardTitle className="text-lg font-bold text-white">Mes Étagères</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-5xl font-bold mb-2">{stats.total_shelves}</div>
            <p className="text-sm opacity-90">📚 Niveaux de rangement</p>
          </CardContent>
        </Card>

        <Card className="stats-card-orange hover-lift">
          <CardHeader className="text-center pb-2">
            <Users className="icon-large mx-auto mb-2" />
            <CardTitle className="text-lg font-bold">Auteurs Favoris</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-5xl font-bold mb-2">{stats.top_authors?.length || 0}</div>
            <p className="text-sm opacity-90">✍️ Écrivains différents</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphiques simplifiés et colorés */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Répartition par placard */}
        <Card className="library-card hover-lift">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800 flex items-center justify-center">
              📊 Mes Livres par Placard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={placardData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                  }}
                />
                <Bar 
                  dataKey="livres" 
                  fill="url(#colorGradient)"
                  radius={[8, 8, 0, 0]}
                />
                <defs>
                  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#667eea" />
                    <stop offset="100%" stopColor="#764ba2" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top auteurs avec design plus simple */}
        <Card className="library-card hover-lift">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800 flex items-center justify-center">
              ⭐ Mes Auteurs Préférés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.top_authors?.slice(0, 6).map((author, index) => (
                <div key={author.author} className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl hover-lift">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {index + 1}
                    </div>
                    <div>
                      <span className="font-bold text-lg text-gray-800">{author.author}</span>
                      <div className="text-sm text-gray-600">✍️ Écrivain</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-purple-600">{author.count}</div>
                    <div className="text-sm text-gray-500">livre{author.count > 1 ? 's' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Message motivant en bas */}
      <Card className="library-card hover-lift text-center p-8">
        <div className="flex items-center justify-center mb-4">
          <Book className="h-8 w-8 text-purple-600 mr-3" />
          <h3 className="text-2xl font-bold text-gray-800">Félicitations ! 🎉</h3>
        </div>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Vous avez <strong className="text-purple-600">{stats.total_books} livres</strong> dans votre magnifique bibliothèque ! 
          Continuez à enrichir votre collection de merveilleux ouvrages. 📚✨
        </p>
        <div className="mt-6 flex justify-center space-x-4">
          <span className="px-4 py-2 bg-gradient-to-r from-green-400 to-blue-500 text-white rounded-full font-semibold">
            📖 Lecture Facile
          </span>
          <span className="px-4 py-2 bg-gradient-to-r from-pink-400 to-red-500 text-white rounded-full font-semibold">
            🌟 Organisation Simple
          </span>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;