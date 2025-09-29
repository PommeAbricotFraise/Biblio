#!/usr/bin/env python3
"""
Comprehensive Backend Testing for Bibliothèque Scolaire
Tests all API endpoints including new barcode scanner and storage types
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://bibliomaster-1.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name, success, message, details=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "details": details
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_root_endpoint(self):
        """Test root API endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "Système de Gestion de Bibliothèque" in data.get("message", ""):
                    self.log_test("Root Endpoint", True, "API root accessible")
                    return True
                else:
                    self.log_test("Root Endpoint", False, "Unexpected response format", data)
                    return False
            else:
                self.log_test("Root Endpoint", False, f"HTTP {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("Root Endpoint", False, f"Connection error: {str(e)}")
            return False
    
    def test_get_books(self):
        """Test GET /books endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/books")
            if response.status_code == 200:
                books = response.json()
                if isinstance(books, list):
                    self.log_test("GET Books", True, f"Retrieved {len(books)} books")
                    return books
                else:
                    self.log_test("GET Books", False, "Response is not a list", books)
                    return []
            else:
                self.log_test("GET Books", False, f"HTTP {response.status_code}", response.text)
                return []
        except Exception as e:
            self.log_test("GET Books", False, f"Error: {str(e)}")
            return []
    
    def test_get_placards(self):
        """Test GET /placards endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/placards")
            if response.status_code == 200:
                placards = response.json()
                if isinstance(placards, list):
                    self.log_test("GET Placards", True, f"Retrieved {len(placards)} placards")
                    return placards
                else:
                    self.log_test("GET Placards", False, "Response is not a list", placards)
                    return []
            else:
                self.log_test("GET Placards", False, f"HTTP {response.status_code}", response.text)
                return []
        except Exception as e:
            self.log_test("GET Placards", False, f"Error: {str(e)}")
            return []
    
    def test_get_shelves(self):
        """Test GET /shelves endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/shelves")
            if response.status_code == 200:
                shelves = response.json()
                if isinstance(shelves, list):
                    self.log_test("GET Shelves", True, f"Retrieved {len(shelves)} shelves")
                    return shelves
                else:
                    self.log_test("GET Shelves", False, "Response is not a list", shelves)
                    return []
            else:
                self.log_test("GET Shelves", False, f"HTTP {response.status_code}", response.text)
                return []
        except Exception as e:
            self.log_test("GET Shelves", False, f"Error: {str(e)}")
            return []
    
    def test_create_placard_with_storage_type(self):
        """Test creating placards with different storage types"""
        storage_types = ["placard", "bac", "mur", "etagere_mobile", "bibliotheque", "autre"]
        created_placards = []
        
        for storage_type in storage_types:
            try:
                placard_data = {
                    "name": f"Test_{storage_type}_{datetime.now().strftime('%H%M%S')}",
                    "description": f"Test placard de type {storage_type}",
                    "location": "Salle de test",
                    "storage_type": storage_type
                }
                
                response = self.session.post(f"{self.base_url}/placards", json=placard_data)
                if response.status_code == 200:
                    placard = response.json()
                    if placard.get("storage_type") == storage_type:
                        self.log_test(f"Create Placard ({storage_type})", True, f"Created placard with storage_type: {storage_type}")
                        created_placards.append(placard)
                    else:
                        self.log_test(f"Create Placard ({storage_type})", False, f"Storage type mismatch: expected {storage_type}, got {placard.get('storage_type')}")
                else:
                    self.log_test(f"Create Placard ({storage_type})", False, f"HTTP {response.status_code}", response.text)
            except Exception as e:
                self.log_test(f"Create Placard ({storage_type})", False, f"Error: {str(e)}")
        
        return created_placards
    
    def test_create_book(self, placard_name="A", shelf_name="1"):
        """Test creating a book"""
        try:
            book_data = {
                "title": f"Livre de Test {datetime.now().strftime('%H%M%S')}",
                "author": "Auteur Test",
                "edition": "Edition Test",
                "isbn": "9782070360130",
                "count": 1,
                "placard": placard_name,
                "shelf": shelf_name,
                "description": "Livre créé pour les tests",
                "language": "fr"
            }
            
            response = self.session.post(f"{self.base_url}/books", json=book_data)
            if response.status_code == 200:
                book = response.json()
                self.log_test("Create Book", True, f"Created book: {book.get('title')}")
                return book
            else:
                self.log_test("Create Book", False, f"HTTP {response.status_code}", response.text)
                return None
        except Exception as e:
            self.log_test("Create Book", False, f"Error: {str(e)}")
            return None
    
    def test_barcode_scanner_valid_isbn(self):
        """Test barcode scanner with valid ISBN"""
        try:
            barcode_data = {
                "barcode": "9782070360130",  # Valid ISBN for Le Petit Prince
                "placard": "A",
                "shelf": "1"
            }
            
            response = self.session.post(f"{self.base_url}/barcode/scan", json=barcode_data)
            if response.status_code == 200:
                result = response.json()
                if "book_info" in result and "suggested_placement" in result:
                    book_info = result["book_info"]
                    if book_info.get("title") and book_info.get("isbn") == "9782070360130":
                        self.log_test("Barcode Scanner (Valid ISBN)", True, f"Found book: {book_info.get('title')}")
                        return result
                    else:
                        self.log_test("Barcode Scanner (Valid ISBN)", False, "Invalid book info structure", result)
                        return None
                else:
                    self.log_test("Barcode Scanner (Valid ISBN)", False, "Missing required fields in response", result)
                    return None
            else:
                self.log_test("Barcode Scanner (Valid ISBN)", False, f"HTTP {response.status_code}", response.text)
                return None
        except Exception as e:
            self.log_test("Barcode Scanner (Valid ISBN)", False, f"Error: {str(e)}")
            return None
    
    def test_barcode_scanner_invalid_isbn(self):
        """Test barcode scanner with invalid ISBN"""
        try:
            barcode_data = {
                "barcode": "1234567890123",  # Invalid ISBN
                "placard": "A",
                "shelf": "1"
            }
            
            response = self.session.post(f"{self.base_url}/barcode/scan", json=barcode_data)
            if response.status_code == 404:
                error_data = response.json()
                error_message = error_data.get("detail", "")
                if "Aucune information trouvée" in error_message:
                    self.log_test("Barcode Scanner (Invalid ISBN)", True, "Correctly returned French error message")
                    return True
                else:
                    self.log_test("Barcode Scanner (Invalid ISBN)", False, f"Error message not in French: {error_message}")
                    return False
            else:
                self.log_test("Barcode Scanner (Invalid ISBN)", False, f"Expected 404, got HTTP {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("Barcode Scanner (Invalid ISBN)", False, f"Error: {str(e)}")
            return False
    
    def test_isbn_lookup(self):
        """Test ISBN lookup endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/isbn/9782070360130")
            if response.status_code == 200:
                book_info = response.json()
                if book_info.get("isbn") == "9782070360130" and book_info.get("title"):
                    self.log_test("ISBN Lookup", True, f"Found book: {book_info.get('title')}")
                    return book_info
                else:
                    self.log_test("ISBN Lookup", False, "Invalid book info structure", book_info)
                    return None
            else:
                self.log_test("ISBN Lookup", False, f"HTTP {response.status_code}", response.text)
                return None
        except Exception as e:
            self.log_test("ISBN Lookup", False, f"Error: {str(e)}")
            return None
    
    def test_french_error_messages(self):
        """Test that error messages are in French"""
        try:
            # Test non-existent book
            response = self.session.get(f"{self.base_url}/books/nonexistent-id")
            if response.status_code == 404:
                error_data = response.json()
                error_message = error_data.get("detail", "")
                if "Livre non trouvé" in error_message:
                    self.log_test("French Error Messages (Book)", True, "Book not found error in French")
                else:
                    self.log_test("French Error Messages (Book)", False, f"Error not in French: {error_message}")
            
            # Test non-existent ISBN
            response = self.session.get(f"{self.base_url}/isbn/0000000000000")
            if response.status_code == 404:
                error_data = response.json()
                error_message = error_data.get("detail", "")
                if "Aucune information trouvée" in error_message:
                    self.log_test("French Error Messages (ISBN)", True, "ISBN not found error in French")
                else:
                    self.log_test("French Error Messages (ISBN)", False, f"Error not in French: {error_message}")
            
            return True
        except Exception as e:
            self.log_test("French Error Messages", False, f"Error: {str(e)}")
            return False
    
    def test_library_stats(self):
        """Test library statistics endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/stats")
            if response.status_code == 200:
                stats = response.json()
                required_fields = ["total_books", "total_placards", "total_shelves", "books_by_placard"]
                if all(field in stats for field in required_fields):
                    self.log_test("Library Stats", True, f"Stats: {stats['total_books']} books, {stats['total_placards']} placards")
                    return stats
                else:
                    self.log_test("Library Stats", False, "Missing required fields", stats)
                    return None
            else:
                self.log_test("Library Stats", False, f"HTTP {response.status_code}", response.text)
                return None
        except Exception as e:
            self.log_test("Library Stats", False, f"Error: {str(e)}")
            return None
    
    def test_book_filtering(self):
        """Test book filtering functionality"""
        try:
            # Test search by title
            response = self.session.get(f"{self.base_url}/books?search=test")
            if response.status_code == 200:
                books = response.json()
                self.log_test("Book Filtering (Search)", True, f"Search returned {len(books)} books")
            else:
                self.log_test("Book Filtering (Search)", False, f"HTTP {response.status_code}", response.text)
            
            # Test filter by placard
            response = self.session.get(f"{self.base_url}/books?placard=A")
            if response.status_code == 200:
                books = response.json()
                self.log_test("Book Filtering (Placard)", True, f"Placard filter returned {len(books)} books")
            else:
                self.log_test("Book Filtering (Placard)", False, f"HTTP {response.status_code}", response.text)
            
            return True
        except Exception as e:
            self.log_test("Book Filtering", False, f"Error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Backend API Tests...")
        print(f"Testing against: {self.base_url}")
        print("=" * 60)
        
        # Basic connectivity
        if not self.test_root_endpoint():
            print("❌ Cannot connect to backend API. Stopping tests.")
            return False
        
        # Test existing endpoints
        books = self.test_get_books()
        placards = self.test_get_placards()
        shelves = self.test_get_shelves()
        
        # Test new storage type functionality
        self.test_create_placard_with_storage_type()
        
        # Test book creation
        self.test_create_book()
        
        # Test new barcode scanner functionality
        self.test_barcode_scanner_valid_isbn()
        self.test_barcode_scanner_invalid_isbn()
        
        # Test ISBN lookup
        self.test_isbn_lookup()
        
        # Test French error messages
        self.test_french_error_messages()
        
        # Test additional endpoints
        self.test_library_stats()
        self.test_book_filtering()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if total - passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        return passed == total

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)