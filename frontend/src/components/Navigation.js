import { NavLink } from "react-router-dom";
import { Book, BarChart3, Layout, BookOpen } from "lucide-react";

const Navigation = () => {
  const navItems = [
    {
      to: "/",
      icon: BarChart3,
      label: "Tableau de bord",
      description: "Vue d'ensemble et statistiques"
    },
    {
      to: "/books",
      icon: Book,
      label: "Gestion des livres",
      description: "Ajouter, modifier et rechercher des livres"
    },
    {
      to: "/visualization",
      icon: Layout,
      label: "Visualisation",
      description: "Plan interactif de la bibliothèque"
    }
  ];

  return (
    <nav className="bg-white shadow-lg border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo et titre */}
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                Bibliothèque Scolaire
              </h1>
              <p className="text-sm text-gray-500">Système de gestion moderne</p>
            </div>
          </div>

          {/* Navigation links */}
          <div className="hidden md:flex space-x-8">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? "bg-blue-100 text-blue-700 border-b-2 border-blue-600"
                        : "text-gray-600 hover:text-blue-600 hover:bg-gray-50"
                    }`
                  }
                  title={item.description}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button className="text-gray-600 hover:text-blue-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;