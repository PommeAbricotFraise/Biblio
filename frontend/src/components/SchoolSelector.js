import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { School, Lock, Users, CheckCircle, AlertCircle } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SchoolSelector = ({ onSchoolSelected }) => {
  const [mode, setMode] = useState("select"); // select, create, login
  const [loading, setLoading] = useState(false);
  const [schoolCode, setSchoolCode] = useState("");
  const [password, setPassword] = useState("");
  const [schoolInfo, setSchoolInfo] = useState(null);

  // Données pour créer une nouvelle école
  const [newSchool, setNewSchool] = useState({
    name: "",
    code: "",
    admin_password: "",
    address: "",
    phone: "",
    email: ""
  });

  // Vérifier si une école est déjà connectée au chargement
  useEffect(() => {
    const checkSavedSchool = async () => {
      const savedSchool = localStorage.getItem("current_school");
      if (savedSchool) {
        try {
          const school = JSON.parse(savedSchool);
          // Vérifier que l'école existe toujours
          await validateSchool(school);
        } catch (e) {
          console.log("Erreur validation école:", e);
          localStorage.removeItem("current_school");
          localStorage.removeItem("school_code");
        }
      }
    };
    
    checkSavedSchool();
  }, [onSchoolSelected]);

  // Valider qu'une école existe toujours
  const validateSchool = async (school) => {
    try {
      const response = await axios.get(`${API}/schools/${school.school_code}`, {
        timeout: 5000 // 5 secondes max
      });
      if (response.data) {
        console.log("École validée, connexion automatique");
        onSchoolSelected(school);
      }
    } catch (error) {
      console.log("École non trouvée ou erreur, suppression de la session:", error.message);
      localStorage.removeItem("current_school");
      localStorage.removeItem("school_code");
      // Force un re-render
      window.location.reload();
    }
  };

  // Rechercher les infos d'une école par son code
  const handleSearchSchool = async () => {
    if (!schoolCode.trim()) {
      toast.error("Veuillez entrer un code école");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${API}/schools/${schoolCode.toUpperCase()}`);
      setSchoolInfo(response.data);
      toast.success(`École trouvée : ${response.data.name}`);
    } catch (error) {
      console.error("Erreur recherche école:", error);
      if (error.response?.status === 404) {
        toast.error("École non trouvée avec ce code");
        setSchoolInfo(null);
      } else {
        toast.error("Erreur lors de la recherche");
      }
    } finally {
      setLoading(false);
    }
  };

  // Se connecter à l'école
  const handleLoginSchool = async (isAdmin = false) => {
    try {
      setLoading(true);
      
      const loginData = {
        code: schoolCode.toUpperCase(),
        password: isAdmin ? password : ""
      };

      const response = await axios.post(`${API}/schools/login`, loginData);
      const schoolData = response.data;

      // Sauvegarder dans localStorage
      localStorage.setItem("current_school", JSON.stringify(schoolData));
      localStorage.setItem("school_code", schoolData.school_code);

      toast.success(schoolData.message);
      onSchoolSelected(schoolData);
      
    } catch (error) {
      console.error("Erreur connexion:", error);
      toast.error(error.response?.data?.detail || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  // Créer une nouvelle école
  const handleCreateSchool = async () => {
    if (!newSchool.name || !newSchool.code || !newSchool.admin_password) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      setLoading(true);
      
      const response = await axios.post(`${API}/schools`, {
        name: newSchool.name,
        code: newSchool.code.toUpperCase(),
        admin_password: newSchool.admin_password,
        address: newSchool.address,
        phone: newSchool.phone,
        email: newSchool.email
      });

      toast.success(`École "${newSchool.name}" créée avec succès !`);
      
      // Auto-connexion après création
      const loginData = {
        code: newSchool.code.toUpperCase(),
        password: newSchool.admin_password
      };

      const loginResponse = await axios.post(`${API}/schools/login`, loginData);
      const schoolData = loginResponse.data;

      localStorage.setItem("current_school", JSON.stringify(schoolData));
      localStorage.setItem("school_code", schoolData.school_code);
      
      onSchoolSelected(schoolData);

    } catch (error) {
      console.error("Erreur création école:", error);
      if (error.response?.status === 400) {
        toast.error("Ce code école existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
    } finally {
      setLoading(false);
    }
  };

  if (mode === "create") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center">
            <School className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <CardTitle className="text-2xl font-bold text-blue-800">
              Créer une nouvelle école
            </CardTitle>
            <p className="text-gray-600">Configurez votre établissement</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="school-name">Nom de l'école *</Label>
              <Input
                id="school-name"
                placeholder="École Primaire Martin"
                value={newSchool.name}
                onChange={(e) => setNewSchool(prev => ({ ...prev, name: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="school-code">Code école (unique) *</Label>
              <Input
                id="school-code"
                placeholder="MARTIN2024"
                value={newSchool.code}
                onChange={(e) => setNewSchool(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                className="mt-1"
                maxLength={10}
              />
              <p className="text-xs text-gray-500 mt-1">Ce code sera utilisé pour se connecter</p>
            </div>

            <div>
              <Label htmlFor="admin-password">Mot de passe administrateur *</Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="Mot de passe sécurisé"
                value={newSchool.admin_password}
                onChange={(e) => setNewSchool(prev => ({ ...prev, admin_password: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="school-address">Adresse</Label>
              <Input
                id="school-address"
                placeholder="123 Rue de l'École, 75000 Paris"
                value={newSchool.address}
                onChange={(e) => setNewSchool(prev => ({ ...prev, address: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="school-phone">Téléphone</Label>
                <Input
                  id="school-phone"
                  placeholder="01 23 45 67 89"
                  value={newSchool.phone}
                  onChange={(e) => setNewSchool(prev => ({ ...prev, phone: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="school-email">Email</Label>
                <Input
                  id="school-email"
                  type="email"
                  placeholder="contact@ecole.fr"
                  value={newSchool.email}
                  onChange={(e) => setNewSchool(prev => ({ ...prev, email: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setMode("select")}
                variant="outline"
                className="flex-1"
              >
                Annuler
              </Button>
              <Button 
                onClick={handleCreateSchool}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {loading ? "Création..." : "Créer l'école"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <School className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <CardTitle className="text-3xl font-bold text-blue-800">
            📚 Bibliothèque Scolaire
          </CardTitle>
          <p className="text-gray-600 text-lg">Sélectionnez votre établissement</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Recherche école */}
          <div className="space-y-3">
            <Label htmlFor="school-code" className="text-lg font-semibold">
              Code de votre école
            </Label>
            <div className="flex gap-2">
              <Input
                id="school-code"
                placeholder="Ex: MARTIN2024"
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value)}
                className="text-lg"
                maxLength={10}
              />
              <Button 
                onClick={handleSearchSchool}
                disabled={loading}
                variant="outline"
                className="px-4"
              >
                🔍
              </Button>
            </div>
          </div>

          {/* Informations école trouvée */}
          {schoolInfo && (
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center mb-2">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                <h3 className="font-bold text-green-800">{schoolInfo.name}</h3>
              </div>
              {schoolInfo.address && (
                <p className="text-sm text-green-700">📍 {schoolInfo.address}</p>
              )}
              {schoolInfo.phone && (
                <p className="text-sm text-green-700">📞 {schoolInfo.phone}</p>
              )}
            </div>
          )}

          {/* Connexions */}
          {schoolInfo && (
            <div className="space-y-3">
              <Button 
                onClick={() => handleLoginSchool(false)}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-lg py-3"
              >
                <Users className="h-5 w-5 mr-2" />
                {loading ? "Connexion..." : "Accès Utilisateur"}
              </Button>

              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Mot de passe administrateur"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-lg"
                />
                <Button 
                  onClick={() => handleLoginSchool(true)}
                  disabled={loading || !password}
                  variant="outline"
                  className="w-full text-lg py-3"
                >
                  <Lock className="h-5 w-5 mr-2" />
                  Accès Administrateur
                </Button>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Ou</span>
            </div>
          </div>

          {/* Créer nouvelle école */}
          <Button 
            onClick={() => setMode("create")}
            variant="outline"
            className="w-full text-lg py-3"
          >
            ➕ Créer une nouvelle école
          </Button>

          {/* Aide */}
          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700 text-center">
            <AlertCircle className="h-4 w-4 inline mr-1" />
            Contactez votre administrateur pour obtenir le code école
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SchoolSelector;