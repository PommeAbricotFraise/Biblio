import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { toast, Toaster } from "sonner";

// Components
import Dashboard from "@/components/Dashboard";
import BookList from "@/components/BookList";
import StorageManager from "@/components/StorageManager";
import LibraryVisualization from "@/components/LibraryVisualization";
import Navigation from "@/components/Navigation";
import InstallPrompt from "@/components/InstallPrompt";
import SchoolSelector from "@/components/SchoolSelector";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Main App Component
function App() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [books, setBooks] = useState([]);
  const [placards, setPlacards] = useState([]);
  const [shelves, setShelves] = useState([]);
  const [currentSchool, setCurrentSchool] = useState(null);
  
  // Configuration axios avec authentification
  const getAxiosConfig = () => {
    const schoolCode = localStorage.getItem("school_code");
    if (!schoolCode) return {};
    
    return {
      headers: {
        "X-School-Code": schoolCode
      }
    };
  };

  // Fetch initial data
  const fetchData = async () => {
    if (!currentSchool) return;
    
    try {
      setLoading(true);
      const config = getAxiosConfig();
      
      const [statsRes, booksRes, placardsRes, shelvesRes] = await Promise.all([
        axios.get(`${API}/stats`, config),
        axios.get(`${API}/books`, config),
        axios.get(`${API}/placards`, config), 
        axios.get(`${API}/shelves`, config)
      ]);
      
      setStats(statsRes.data);
      setBooks(booksRes.data);
      setPlacards(placardsRes.data);
      setShelves(shelvesRes.data);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      toast.error("Erreur lors du chargement des données");
      setStats(null);
      setBooks([]);
      setPlacards([]);
      setShelves([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Gérer la sélection d'école
  const handleSchoolSelected = (schoolData) => {
    setCurrentSchool(schoolData);
    fetchData(); // Charger les données de l'école
  };

  // Gérer la déconnexion
  const handleLogout = () => {
    localStorage.removeItem("current_school");
    localStorage.removeItem("school_code");
    setCurrentSchool(null);
    setBooks([]);
    setPlacards([]);
    setShelves([]);
  };

  // Fonction refresh avec authentification
  const refreshData = async () => {
    await fetchData();
  };

  // Load data when school changes
  useEffect(() => {
    if (currentSchool) {
      fetchData();
    }
  }, [currentSchool]);
  
  // refreshData function is now defined above with authentication

  // Si aucune école n'est sélectionnée, afficher le sélecteur
  if (!currentSchool) {
    return <SchoolSelector onSchoolSelected={handleSchoolSelected} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <h2 className="text-xl font-semibold text-gray-700 mt-4">
            Chargement des données de {currentSchool.school_name}...
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          <Navigation 
            currentSchool={currentSchool}
            onLogout={handleLogout}
          />
          
          <main className="flex-1 container mx-auto px-4 py-8">
            <Routes>
              <Route 
                path="/" 
                element={
                  <Dashboard 
                    stats={stats} 
                    refreshData={refreshData}
                    currentSchool={currentSchool}
                  />
                } 
              />
              <Route 
                path="/books" 
                element={
                  <BookList 
                    books={books}
                    placards={placards}
                    shelves={shelves}
                    refreshData={refreshData}
                    currentSchool={currentSchool}
                  />
                } 
              />
              <Route 
                path="/storage" 
                element={
                  <StorageManager 
                    placards={placards}
                    shelves={shelves}
                    refreshData={refreshData}
                    currentSchool={currentSchool}
                  />
                } 
              />
              <Route 
                path="/visualization" 
                element={
                  <LibraryVisualization 
                    refreshData={refreshData}
                    currentSchool={currentSchool}
                  />
                } 
              />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
      
      <Toaster position="top-right" />
      <InstallPrompt />
    </div>
  );
}

export default App;
