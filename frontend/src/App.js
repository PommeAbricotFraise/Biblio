import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { toast, Toaster } from "sonner";

// Components
import Dashboard from "@/components/Dashboard";
import BookList from "@/components/BookList";
import LibraryVisualization from "@/components/LibraryVisualization";
import Navigation from "@/components/Navigation";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Main App Component
function App() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [books, setBooks] = useState([]);
  const [placards, setPlacards] = useState([]);
  const [shelves, setShelves] = useState([]);
  
  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [statsRes, booksRes, placardsRes, shelvesRes] = await Promise.all([
        axios.get(`${API}/stats`),
        axios.get(`${API}/books`),
        axios.get(`${API}/placards`),
        axios.get(`${API}/shelves`)
      ]);
      
      setStats(statsRes.data);
      setBooks(booksRes.data);
      setPlacards(placardsRes.data);
      setShelves(shelvesRes.data);
      
    } catch (error) {
      console.error("Erreur lors du chargement des données:", error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  // Refresh data function to be passed to child components
  const refreshData = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <h2 className="text-xl font-semibold text-gray-700 mt-4">
            Chargement du système de bibliothèque...
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          <Navigation />
          
          <main className="flex-1 container mx-auto px-4 py-8">
            <Routes>
              <Route 
                path="/" 
                element={
                  <Dashboard 
                    stats={stats} 
                    refreshData={refreshData}
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
                  />
                } 
              />
              <Route 
                path="/visualization" 
                element={
                  <LibraryVisualization 
                    refreshData={refreshData}
                  />
                } 
              />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
      
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
