import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

class DataService {
  constructor() {
    this.axios = axios.create({
      baseURL: API,
      timeout: 15000, // 15 secondes
    });

    // Intercepteur pour ajouter automatiquement l'authentification
    this.axios.interceptors.request.use((config) => {
      const schoolCode = localStorage.getItem('school_code');
      if (schoolCode) {
        config.headers['X-School-Code'] = schoolCode;
      }
      return config;
    });

    // Intercepteur pour gérer les erreurs d'authentification
    this.axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.log('Session expirée, redirection...');
          localStorage.clear();
          window.location.reload();
        }
        return Promise.reject(error);
      }
    );
  }

  // Récupérer toutes les données d'une école en une seule requête optimisée
  async getAllSchoolData() {
    try {
      const [booksRes, placardsRes, shelvesRes] = await Promise.all([
        this.axios.get('/books'),
        this.axios.get('/placards'),
        this.axios.get('/shelves')
      ]);

      return {
        books: booksRes.data || [],
        placards: placardsRes.data || [],
        shelves: shelvesRes.data || [],
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Erreur chargement données école:', error);
      throw error;
    }
  }

  // Méthodes individuelles pour modifications
  async getBooks() {
    const response = await this.axios.get('/books');
    return response.data;
  }

  async createBook(bookData) {
    const response = await this.axios.post('/books', bookData);
    return response.data;
  }

  async updateBook(bookId, bookData) {
    const response = await this.axios.put(`/books/${bookId}`, bookData);
    return response.data;
  }

  async deleteBook(bookId) {
    await this.axios.delete(`/books/${bookId}`);
  }

  async getPlacards() {
    const response = await this.axios.get('/placards');
    return response.data;
  }

  async createPlacard(placardData) {
    const response = await this.axios.post('/placards', placardData);
    return response.data;
  }

  async deletePlacard(placardId) {
    await this.axios.delete(`/placards/${placardId}`);
  }

  async getShelves() {
    const response = await this.axios.get('/shelves');
    return response.data;
  }

  async createShelf(shelfData) {
    const response = await this.axios.post('/shelves', shelfData);
    return response.data;
  }

  async deleteShelf(shelfId) {
    await this.axios.delete(`/shelves/${shelfId}`);
  }

  // Recherche ISBN
  async lookupISBN(isbn) {
    const response = await this.axios.get(`/isbn/${isbn}`);
    return response.data;
  }

  // Export Excel
  async exportExcel(filters = {}) {
    const params = new URLSearchParams(filters);
    const response = await this.axios.get(`/export/excel?${params}`, {
      responseType: 'blob'
    });
    return response.data;
  }

  // Authentification écoles
  async loginSchool(code, password = '') {
    const response = await this.axios.post('/schools/login', {
      code: code.toUpperCase(),
      password
    });
    return response.data;
  }

  async createSchool(schoolData) {
    const response = await this.axios.post('/schools', {
      ...schoolData,
      code: schoolData.code.toUpperCase()
    });
    return response.data;
  }

  async getSchoolInfo(code) {
    const response = await this.axios.get(`/schools/${code.toUpperCase()}`);
    return response.data;
  }
}

export default new DataService();