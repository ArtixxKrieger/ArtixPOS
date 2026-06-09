import React, { useState } from "react";
import { Search, User, Plus, Minus, CreditCard, Banknote, QrCode } from "lucide-react";

export function MinimalistClean() {
  const [activeCategory, setActiveCategory] = useState("All");
  
  const categories = ["All", "Coffee", "Food", "Drinks", "Snacks"];
  
  const products = [
    { id: 1, name: "Espresso", price: 95, category: "Coffee" },
    { id: 2, name: "Latte", price: 130, category: "Coffee" },
    { id: 3, name: "Cold Brew", price: 150, category: "Coffee" },
    { id: 4, name: "Americano", price: 110, category: "Coffee" },
    { id: 5, name: "Mocha", price: 140, category: "Coffee" },
    { id: 6, name: "Muffin", price: 80, category: "Food" },
    { id: 7, name: "Croissant", price: 90, category: "Food" },
    { id: 8, name: "Bagel", price: 85, category: "Food" },
    { id: 9, name: "Iced Tea", price: 95, category: "Drinks" },
    { id: 10, name: "Orange Juice", price: 110, category: "Drinks" },
    { id: 11, name: "Granola Bar", price: 65, category: "Snacks" },
    { id: 12, name: "Cookie", price: 50, category: "Snacks" },
  ];
  
  const [order, setOrder] = useState([
    { id: 1, name: "Espresso", price: 95, qty: 1 },
    { id: 6, name: "Muffin", price: 80, qty: 2 }
  ]);
  
  const subtotal = order.reduce((acc, item) => acc + item.price * item.qty, 0);
  
  const updateQty = (id: number, delta: number) => {
    setOrder(current => 
      current.map(item => {
        if (item.id === id) {
          const newQty = item.qty + delta;
          return { ...item, qty: newQty };
        }
        return item;
      }).filter(item => item.qty > 0)
    );
  };

  const addToOrder = (product: typeof products[0]) => {
    setOrder(current => {
      const existing = current.find(item => item.id === product.id);
      if (existing) {
        return current.map(item => 
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...current, { id: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  };
  
  return (
    <div className="min-h-screen bg-white text-[#111827] font-sans antialiased flex flex-col">
      {/* Slim Top Navigation */}
      <header className="h-14 border-b border-[#e5e7eb] px-6 flex items-center justify-between bg-white">
        <div className="flex items-center space-x-8">
          <div className="font-semibold text-lg tracking-tight">VEND.</div>
          <nav className="hidden md:flex space-x-6">
            <a href="#" className="text-sm font-medium text-[#111827]">POS</a>
            <a href="#" className="text-sm font-medium text-[#6b7280] hover:text-[#111827]">Products</a>
            <a href="#" className="text-sm font-medium text-[#6b7280] hover:text-[#111827]">Reports</a>
            <a href="#" className="text-sm font-medium text-[#6b7280] hover:text-[#111827]">Customers</a>
          </nav>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="hidden lg:flex items-center space-x-6 text-[11px] uppercase tracking-wide text-[#6b7280]">
            <div>Today's Sales <span className="text-[#111827] font-medium ml-1">₱24,850</span></div>
            <div>Transactions <span className="text-[#111827] font-medium ml-1">137</span></div>
            <div>Avg <span className="text-[#111827] font-medium ml-1">₱181</span></div>
          </div>
          <div className="w-px h-4 bg-[#e5e7eb] hidden lg:block"></div>
          <div className="flex items-center space-x-4 text-[#6b7280]">
            <Search className="w-4 h-4 cursor-pointer hover:text-[#111827]" />
            <User className="w-4 h-4 cursor-pointer hover:text-[#111827]" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Content Area (65%) */}
        <div className="w-[65%] flex flex-col bg-[#f9fafb] border-r border-[#e5e7eb]">
          <div className="p-8 pb-4">
            <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 text-sm font-medium rounded border transition-colors whitespace-nowrap ${
                    activeCategory === cat 
                      ? 'bg-white border-[#111827] text-[#111827]' 
                      : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products
                .filter(p => activeCategory === "All" || p.category === activeCategory)
                .map(product => (
                <div 
                  key={product.id} 
                  className="bg-white border border-[#e5e7eb] rounded p-2 relative group cursor-pointer hover:border-[#d1d5db] transition-colors"
                  onClick={() => addToOrder(product)}
                >
                  <button className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-[#f9fafb] border border-[#e5e7eb] rounded text-[#6b7280] hover:text-[#111827] transition-colors">
                    <Plus className="w-3 h-3" />
                  </button>
                  <div className="w-10 h-10 bg-[#f9fafb] rounded-full border border-[#e5e7eb] mb-3 mt-1 ml-1 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-[#e5e7eb]"></div>
                  </div>
                  <div className="px-1">
                    <div className="text-[13px] font-medium text-[#111827]">{product.name}</div>
                    <div className="text-xs text-[#6b7280] mt-1">₱{product.price}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Order Panel (35%) */}
        <div className="w-[35%] bg-white flex flex-col">
          <div className="p-8 border-b border-[#e5e7eb]">
            <h2 className="text-sm font-semibold text-[#111827] uppercase tracking-wide">Current Order</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8">
            <div className="space-y-4">
              {order.map(item => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-[#111827]">{item.name}</div>
                    <div className="text-xs text-[#6b7280]">₱{item.price}</div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center border border-[#e5e7eb] rounded">
                      <button 
                        onClick={() => updateQty(item.id, -1)}
                        className="w-7 h-7 flex items-center justify-center text-[#6b7280] hover:text-[#111827] transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <div className="w-6 text-center text-[13px] font-medium text-[#111827]">
                        {item.qty}
                      </div>
                      <button 
                        onClick={() => updateQty(item.id, 1)}
                        className="w-7 h-7 flex items-center justify-center text-[#6b7280] hover:text-[#111827] border-l border-[#e5e7eb] transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="w-16 text-right text-[13px] font-medium text-[#111827]">
                      ₱{item.price * item.qty}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="p-8 pt-4 border-t border-[#e5e7eb]">
            <div className="flex justify-between items-center text-[13px] mb-3">
              <span className="text-[#6b7280]">Subtotal</span>
              <span className="text-[#111827] font-medium">₱{subtotal}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] mb-4">
              <span className="text-[#6b7280]">Tax (12%)</span>
              <span className="text-[#111827] font-medium">₱{Math.round(subtotal * 0.12)}</span>
            </div>
            <div className="h-px bg-[#e5e7eb] mb-4 w-full"></div>
            <div className="flex justify-between items-center mb-6">
              <span className="text-[13px] font-semibold text-[#111827]">Total</span>
              <span className="text-2xl font-bold text-[#111827]">₱{subtotal + Math.round(subtotal * 0.12)}</span>
            </div>
            
            <div className="grid grid-cols-3 gap-3 mb-6">
              <button className="flex flex-col items-center justify-center py-3 border border-[#e5e7eb] rounded hover:border-[#111827] transition-colors text-[#111827]">
                <Banknote className="w-4 h-4 mb-1 text-[#6b7280]" />
                <span className="text-[11px] font-medium uppercase tracking-wide">Cash</span>
              </button>
              <button className="flex flex-col items-center justify-center py-3 border border-[#111827] bg-[#f9fafb] rounded transition-colors text-[#111827]">
                <CreditCard className="w-4 h-4 mb-1 text-[#111827]" />
                <span className="text-[11px] font-medium uppercase tracking-wide">Card</span>
              </button>
              <button className="flex flex-col items-center justify-center py-3 border border-[#e5e7eb] rounded hover:border-[#111827] transition-colors text-[#111827]">
                <QrCode className="w-4 h-4 mb-1 text-[#6b7280]" />
                <span className="text-[11px] font-medium uppercase tracking-wide">QR</span>
              </button>
            </div>
            
            <button className="w-full h-12 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium rounded transition-colors flex items-center justify-center text-[13px]">
              Charge ₱{subtotal + Math.round(subtotal * 0.12)}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
