import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Archive,
  Package,
  Wall,
  BookOpen as ShelfIcon,
  Trash2,
  Edit,
  Package2,
  Container
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const StorageManager = ({ placards = [], shelves = [], refreshData }) => {
  const [isAddPlacardOpen, setIsAddPlacardOpen] = useState(false);
  const [isAddShelfOpen, setIsAddShelfOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Formulaire nouveau rangement
  const [newStorage, setNewStorage] = useState({
    name: "",
    description: "",
    location: "",
    capacity: "",
    storage_type: "placard"
  });

  // Formulaire nouvelle étagère
  const [newShelf, setNewShelf] = useState({
    name: "",
    placard_name: "",
    position: "",
    capacity: "",
    description: ""
  });

  // Types de rangement prédéfinis
  const storageTypes = [
    { value: "placard", label: "📁 Placard", icon: Archive },
    { value: "bac", label: "📦 Bac", icon: Package },
    { value: "mur", label: "🧱 Mur", icon: Wall },
    { value: "etagere_mobile", label: "🛒 Étagère mobile", icon: Container },
    { value: "bibliotheque", label: "📚 Bibliothèque", icon: ShelfIcon },
    { value: "autre", label: "📋 Autre", icon: Package2 }
  ];

  // Réinitialiser le formulaire rangement
  const resetStorageForm = () => {
    setNewStorage({
      name: "",
      description: "",
      location: "",
      capacity: "",
      storage_type: "placard"
    });
  };

  // Réinitialiser le formulaire étagère
  const resetShelfForm = () => {
    setNewShelf({
      name: "",
      placard_name: "",
      position: "",
      capacity: "",
      description: ""
    });
  };

  // Ajouter un nouveau rangement
  const handleAddStorage = async () => {
    try {
      setLoading(true);
      
      const storageData = {
        name: newStorage.name,
        description: newStorage.description,
        location: newStorage.location,
        storage_type: newStorage.storage_type
      };

      if (newStorage.capacity) {
        storageData.capacity = parseInt(newStorage.capacity);
      }

      await axios.post(`${API}/placards`, storageData);
      
      toast.success(`🎉 ${newStorage.storage_type} "${newStorage.name}" ajouté avec succès !`);
      resetStorageForm();
      setIsAddPlacardOpen(false);
      refreshData();
    } catch (error) {
      console.error("Erreur lors de l'ajout du rangement:", error);
      toast.error("❌ Erreur lors de l'ajout du rangement");
    } finally {
      setLoading(false);
    }
  };

  // Ajouter une nouvelle étagère
  const handleAddShelf = async () => {
    try {
      setLoading(true);
      
      const shelfData = {
        name: newShelf.name,
        placard_name: newShelf.placard_name,
        description: newShelf.description
      };

      if (newShelf.position) {
        shelfData.position = parseInt(newShelf.position);
      }

      if (newShelf.capacity) {
        shelfData.capacity = parseInt(newShelf.capacity);
      }

      await axios.post(`${API}/shelves`, shelfData);
      
      toast.success(`📋 Étagère "${newShelf.name}" ajoutée avec succès !`);
      resetShelfForm();
      setIsAddShelfOpen(false);
      refreshData();
    } catch (error) {
      console.error("Erreur lors de l'ajout de l'étagère:", error);
      toast.error("❌ Erreur lors de l'ajout de l'étagère");
    } finally {
      setLoading(false);
    }
  };

  // Supprimer un rangement
  const handleDeleteStorage = async (storageId, storageName) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le rangement "${storageName}" ? ⚠️\n\nCela pourrait affecter les livres associés.`)) {
      return;
    }

    try {
      await axios.delete(`${API}/placards/${storageId}`);
      toast.success(`🗑️ Rangement "${storageName}" supprimé avec succès !`);
      refreshData();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      toast.error("❌ Erreur lors de la suppression du rangement");
    }
  };

  // Supprimer une étagère
  const handleDeleteShelf = async (shelfId, shelfName) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'étagère "${shelfName}" ? ⚠️\n\nCela pourrait affecter les livres associés.`)) {
      return;
    }

    try {
      await axios.delete(`${API}/shelves/${shelfId}`);
      toast.success(`🗑️ Étagère "${shelfName}" supprimée avec succès !`);
      refreshData();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      toast.error("❌ Erreur lors de la suppression de l'étagère");
    }
  };

  // Obtenir l'icône pour un type de rangement
  const getStorageIcon = (storageType) => {
    const type = storageTypes.find(t => t.value === storageType);
    return type ? type.icon : Archive;
  };

  // Obtenir le label pour un type de rangement
  const getStorageLabel = (storageType) => {
    const type = storageTypes.find(t => t.value === storageType);
    return type ? type.label : "📁 Placard";
  };

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <Container className="h-12 w-12 text-purple-500 mr-3" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Gestion des Rangements
          </h1>
        </div>
        <p className="text-xl text-gray-600 mb-6">
          🏗️ Organisez votre bibliothèque avec des rangements personnalisés
        </p>
        
        {/* Boutons d'ajout */}
        <div className="flex flex-wrap justify-center gap-4">
          <Dialog open={isAddPlacardOpen} onOpenChange={setIsAddPlacardOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white hover-lift px-6 py-3 text-lg">
                <Plus className="h-5 w-5 mr-2" />
                🏗️ Nouveau Rangement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center">
                  <Plus className="h-6 w-6 mr-2 text-green-600" />
                  Ajouter un nouveau rangement
                </DialogTitle>
                <DialogDescription className="text-lg">
                  Créez un nouveau type de rangement pour organiser vos livres 📚
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="storage-name" className="text-lg font-semibold">Nom du rangement *</Label>
                  <Input
                    id="storage-name"
                    placeholder="ex: A, Principal, Classe..."
                    value={newStorage.name}
                    onChange={(e) => setNewStorage(prev => ({ ...prev, name: e.target.value }))}
                    className="form-input text-lg mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="storage-type" className="text-lg font-semibold">Type de rangement *</Label>
                  <Select 
                    value={newStorage.storage_type} 
                    onValueChange={(value) => setNewStorage(prev => ({ ...prev, storage_type: value }))}
                  >
                    <SelectTrigger className="form-input text-lg mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {storageTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="storage-location" className="text-lg font-semibold">Emplacement</Label>
                  <Input
                    id="storage-location"
                    placeholder="ex: Salle de classe, Couloir..."
                    value={newStorage.location}
                    onChange={(e) => setNewStorage(prev => ({ ...prev, location: e.target.value }))}
                    className="form-input text-lg mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="storage-capacity" className="text-lg font-semibold">Capacité (livres)</Label>
                  <Input
                    id="storage-capacity"
                    type="number"
                    placeholder="ex: 100"
                    value={newStorage.capacity}
                    onChange={(e) => setNewStorage(prev => ({ ...prev, capacity: e.target.value }))}
                    className="form-input text-lg mt-2"
                  />
                </div>
              </div>

              <div className="col-span-2">
                <Label htmlFor="storage-description" className="text-lg font-semibold">Description</Label>
                <Textarea
                  id="storage-description"
                  placeholder="Décrivez ce rangement..."
                  value={newStorage.description}
                  onChange={(e) => setNewStorage(prev => ({ ...prev, description: e.target.value }))}
                  className="form-input text-lg mt-2"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <Button 
                  onClick={() => setIsAddPlacardOpen(false)}
                  variant="outline"
                  className="px-6 py-2"
                >
                  Annuler
                </Button>
                <Button 
                  onClick={handleAddStorage}
                  disabled={!newStorage.name || loading}
                  className="button-success px-6 py-2"
                >
                  {loading ? "Ajout..." : "✅ Ajouter le rangement"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddShelfOpen} onOpenChange={setIsAddShelfOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white hover-lift px-6 py-3 text-lg">
                <Plus className="h-5 w-5 mr-2" />
                📋 Nouvelle Étagère
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center">
                  <Plus className="h-6 w-6 mr-2 text-blue-600" />
                  Ajouter une nouvelle étagère
                </DialogTitle>
                <DialogDescription className="text-lg">
                  Ajoutez une étagère à un rangement existant 📋
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="shelf-name" className="text-lg font-semibold">Nom de l'étagère *</Label>
                  <Input
                    id="shelf-name"
                    placeholder="ex: 1, A, Haut, Bas..."
                    value={newShelf.name}
                    onChange={(e) => setNewShelf(prev => ({ ...prev, name: e.target.value }))}
                    className="form-input text-lg mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="shelf-placard" className="text-lg font-semibold">Rangement *</Label>
                  <Select 
                    value={newShelf.placard_name} 
                    onValueChange={(value) => setNewShelf(prev => ({ ...prev, placard_name: value }))}
                  >
                    <SelectTrigger className="form-input text-lg mt-2">
                      <SelectValue placeholder="Choisir un rangement" />
                    </SelectTrigger>
                    <SelectContent>
                      {placards.map(placard => (
                        <SelectItem key={placard.id} value={placard.name}>
                          {getStorageLabel(placard.storage_type || "placard")} {placard.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="shelf-position" className="text-lg font-semibold">Position</Label>
                  <Input
                    id="shelf-position"
                    type="number"
                    placeholder="ex: 1, 2, 3..."
                    value={newShelf.position}
                    onChange={(e) => setNewShelf(prev => ({ ...prev, position: e.target.value }))}
                    className="form-input text-lg mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="shelf-capacity" className="text-lg font-semibold">Capacité (livres)</Label>
                  <Input
                    id="shelf-capacity"
                    type="number"
                    placeholder="ex: 20"
                    value={newShelf.capacity}
                    onChange={(e) => setNewShelf(prev => ({ ...prev, capacity: e.target.value }))}
                    className="form-input text-lg mt-2"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="shelf-description" className="text-lg font-semibold">Description</Label>
                <Textarea
                  id="shelf-description"
                  placeholder="Décrivez cette étagère..."
                  value={newShelf.description}
                  onChange={(e) => setNewShelf(prev => ({ ...prev, description: e.target.value }))}
                  className="form-input text-lg mt-2"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <Button 
                  onClick={() => setIsAddShelfOpen(false)}
                  variant="outline"
                  className="px-6 py-2"
                >
                  Annuler
                </Button>
                <Button 
                  onClick={handleAddShelf}
                  disabled={!newShelf.name || !newShelf.placard_name || loading}
                  className="button-success px-6 py-2"
                >
                  {loading ? "Ajout..." : "✅ Ajouter l'étagère"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Liste des rangements existants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Rangements */}
        <Card className="library-card hover-lift">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center">
              <Container className="h-8 w-8 mr-3 text-purple-600" />
              Mes Rangements ({placards.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {placards.map(placard => {
                const StorageIcon = getStorageIcon(placard.storage_type);
                return (
                  <div key={placard.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border-l-4 border-purple-400">
                    <div className="flex items-center space-x-4">
                      <StorageIcon className="h-8 w-8 text-purple-600" />
                      <div>
                        <h3 className="text-lg font-bold">{getStorageLabel(placard.storage_type)} {placard.name}</h3>
                        {placard.description && (
                          <p className="text-sm text-gray-600">{placard.description}</p>
                        )}
                        {placard.location && (
                          <p className="text-xs text-purple-600">📍 {placard.location}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleDeleteStorage(placard.id, placard.name)}
                      size="sm"
                      className="bg-red-500 hover:bg-red-600 text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              
              {placards.length === 0 && (
                <div className="text-center py-8">
                  <Container className="h-16 w-16 text-purple-300 mx-auto mb-4" />
                  <p className="text-lg text-gray-600">Aucun rangement créé pour l'instant</p>
                  <p className="text-gray-500">Créez votre premier rangement ! 🏗️</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Étagères */}
        <Card className="library-card hover-lift">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center">
              <ShelfIcon className="h-8 w-8 mr-3 text-blue-600" />
              Mes Étagères ({shelves.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {shelves.map(shelf => (
                <div key={shelf.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border-l-4 border-blue-400">
                  <div className="flex items-center space-x-4">
                    <ShelfIcon className="h-8 w-8 text-blue-600" />
                    <div>
                      <h3 className="text-lg font-bold">📋 Étagère {shelf.name}</h3>
                      <p className="text-sm text-blue-600">
                        dans {getStorageLabel(placards.find(p => p.name === shelf.placard_name)?.storage_type)} {shelf.placard_name}
                      </p>
                      {shelf.description && (
                        <p className="text-xs text-gray-600">{shelf.description}</p>
                      )}
                      {shelf.position && (
                        <p className="text-xs text-green-600">Position: {shelf.position}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDeleteShelf(shelf.id, shelf.name)}
                    size="sm"
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              
              {shelves.length === 0 && (
                <div className="text-center py-8">
                  <ShelfIcon className="h-16 w-16 text-blue-300 mx-auto mb-4" />
                  <p className="text-lg text-gray-600">Aucune étagère créée pour l'instant</p>
                  <p className="text-gray-500">Ajoutez des étagères à vos rangements ! 📋</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StorageManager;