import { NavLink } from "react-router-dom";
import { Book, BarChart3, Layout, BookOpen, Sparkles } from "lucide-react";

const Navigation = () => {
  const navItems = [
    {
      to: "/",
      icon: BarChart3,
      label: "Tableau de bord",
      description: "Statistiques de votre bibliothèque",
      color: "text-blue-300"
    },
    {
      to: "/books",
      icon: Book,
      label: "Mes Livres",
      description: "Gérer tous vos livres",
      color: "text-green-300"
    },
    {
      to: "/visualization",
      icon: Layout,
      label: "Plan Bibliothèque",
      description: "Voir où sont vos livres",
      color: "text-pink-300"
    }
  ];

  return (
    <nav className="nav-header shadow-lg">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-18">
          {/* Logo coloré et attirant */}
          <div className="flex items-center space-x-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center">
                <Sparkles className="h-6 w-6 mr-2 text-yellow-300" />
                Ma Bibliothèque
              </h1>
              <p className="text-white/80 text-sm">Simple et colorée</p>
            </div>
          </div>

          {/* Navigation avec icônes colorées */}
          <div className="hidden md:flex space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex flex-col items-center space-y-1 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                      isActive
                        ? "bg-white/20 text-white shadow-lg"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                    }`
                  }
                  title={item.description}
                >
                  <Icon className={`h-6 w-6 ${item.color}`} />
                  <span className="text-xs">{item.label}</span>
                </NavLink>
              );
            })}
          </div>

          {/* Menu mobile simplifié */}
          <div className="md:hidden">
            <button className="text-white/80 hover:text-white bg-white/10 p-2 rounded-lg">
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