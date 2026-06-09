import React, { useState } from "react";
import { 
  LayoutDashboard, 
  MonitorSmartphone, 
  Package, 
  Users, 
  BarChart3, 
  Settings,
  Bell,
  User,
  ChevronDown,
  Search,
  CheckCircle2,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  SplitSquareHorizontal
} from "lucide-react";

export function RetailEnterprise() {
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = ["All", "Beverages", "Food", "Electronics", "Sale"];

  const products = [
    { id: 1, name: "Americano", price: 120, category: "Beverages", color: "bg-amber-800" },
    { id: 2, name: "Caramel Latte", price: 150, category: "Beverages", color: "bg-amber-600" },
    { id: 3, name: "Matcha Frappe", price: 180, category: "Beverages", color: "bg-emerald-600" },
    { id: 4, name: "Croissant", price: 85, category: "Food", color: "bg-yellow-600" },
    { id: 5, name: "Club Sandwich", price: 250, category: "Food", color: "bg-orange-500" },
    { id: 6, name: "Mineral Water", price: 40, category: "Beverages", color: "bg-blue-400" },
    { id: 7, name: "Wireless Mouse", price: 850, category: "Electronics", color: "bg-gray-800" },
    { id: 8, name: "USB-C Cable", price: 350, category: "Electronics", color: "bg-gray-400" },
    { id: 9, name: "Coffee Beans 250g", price: 450, category: "Sale", color: "bg-amber-900" },
    { id: 10, name: "Tote Bag", price: 299, category: "Sale", color: "bg-stone-500" },
    { id: 11, name: "Chocolate Muffin", price: 95, category: "Food", color: "bg-amber-950" },
    { id: 12, name: "Iced Tea", price: 80, category: "Beverages", color: "bg-orange-600" },
  ];

  const filteredProducts = activeCategory === "All" 
    ? products 
    : products.filter(p => p.category === activeCategory);

  const cart = [
    { id: 2, name: "Caramel Latte", price: 150, qty: 2 },
    { id: 4, name: "Croissant", price: 85, qty: 1 },
    { id: 5, name: "Club Sandwich", price: 250, qty: 1 },
  ];

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = subtotal * 0.12;
  const total = subtotal + tax;

  return (
    <div className="flex h-screen w-full bg-white font-sans text-gray-800 overflow-hidden">
      {/* Sidebar */}
      <div className="w-[240px] bg-[#1a1a2e] text-white flex flex-col flex-shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="w-8 h-8 rounded bg-[#f4623a] flex items-center justify-center font-bold text-white">
            A
          </div>
          <span className="font-semibold text-lg tracking-wide">Artix Retail</span>
        </div>
        
        <nav className="flex-1 py-4">
          <ul className="space-y-1 px-3">
            <li>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                <LayoutDashboard size={20} />
                <span className="font-medium text-sm">Dashboard</span>
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#0f3460] text-white rounded-md transition-colors">
                <MonitorSmartphone size={20} />
                <span className="font-medium text-sm">POS / Register</span>
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                <Package size={20} />
                <span className="font-medium text-sm">Products</span>
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                <Users size={20} />
                <span className="font-medium text-sm">Customers</span>
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                <BarChart3 size={20} />
                <span className="font-medium text-sm">Reports</span>
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                <Settings size={20} />
                <span className="font-medium text-sm">Settings</span>
              </button>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-white/10 text-xs text-gray-500">
          App Version 2.4.1
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full bg-gray-50">
        {/* Top Bar */}
        <header className="h-[72px] bg-white border-b border-[#e5e7eb] px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded-md transition-colors">
              <span className="font-semibold text-gray-800">Main Branch</span>
              <ChevronDown size={16} className="text-gray-500" />
            </div>
            
            <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100">
                <CheckCircle2 size={14} />
                Terminal Active
              </div>
              <div className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                Today ₱24,850
              </div>
              <div className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium border border-gray-200">
                12 items sold
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#f4623a] rounded-full"></span>
            </button>
            <div className="h-8 w-[1px] bg-gray-200"></div>
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-gray-700">Maria S.</div>
                <div className="text-xs text-gray-500">Cashier</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#0f3460] text-white flex items-center justify-center font-medium">
                MS
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Products (60%) */}
          <div className="w-[60%] flex flex-col h-full border-r border-[#e5e7eb] bg-white">
            {/* Search & Filters */}
            <div className="p-6 pb-0 flex-shrink-0">
              <div className="relative mb-6">
                <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search products by name or SKU..." 
                  className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0f3460]/20 focus:border-[#0f3460] transition-all"
                />
              </div>
              
              <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                {categories.map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      activeCategory === cat 
                        ? 'bg-[#1a1a2e] text-white' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto p-6 pt-2">
              <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {filteredProducts.map(product => (
                  <div key={product.id} className="bg-white rounded-lg border border-[#e5e7eb] shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col">
                    <div className={`h-[120px] w-full ${product.color} opacity-80`}></div>
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="font-medium text-sm text-gray-800 line-clamp-2 flex-1">{product.name}</h3>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-bold text-[#1a1a2e]">₱{product.price.toLocaleString()}</span>
                        <button className="w-8 h-8 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-200 flex items-center justify-center text-[#0f3460] transition-colors">
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel: Order (40%) */}
          <div className="w-[40%] bg-gray-50 flex flex-col h-full">
            <div className="p-6 border-b border-[#e5e7eb] bg-white flex justify-between items-center flex-shrink-0">
              <h2 className="text-lg font-semibold text-[#1a1a2e]">Current Order</h2>
              <span className="px-2.5 py-1 bg-gray-100 rounded text-sm font-medium text-gray-600">
                Order #1042
              </span>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {cart.map((item, idx) => (
                <div key={idx} className="flex bg-white p-4 rounded-lg border border-[#e5e7eb] shadow-sm">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-800 text-sm">{item.name}</h4>
                    <div className="text-[#f4623a] font-semibold mt-1">₱{item.price.toLocaleString()}</div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <button className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                    <div className="flex items-center gap-3 bg-gray-50 rounded-md border border-gray-200 p-1">
                      <button className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded">
                        <Minus size={14} />
                      </button>
                      <span className="text-sm font-medium w-4 text-center">{item.qty}</span>
                      <button className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded">
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              <button className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-medium text-sm hover:border-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-2">
                <Search size={16} />
                Add custom item
              </button>
            </div>

            {/* Totals & Payment */}
            <div className="p-6 bg-white border-t border-[#e5e7eb] flex-shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-500 text-sm">
                  <span>Subtotal</span>
                  <span>₱{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-sm">
                  <span>Tax (12%)</span>
                  <span>₱{tax.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-sm">
                  <span>Discount</span>
                  <span>₱0.00</span>
                </div>
                <div className="pt-3 border-t border-gray-100 flex justify-between items-end">
                  <span className="text-gray-800 font-medium">Total</span>
                  <span className="text-3xl font-bold text-[#1a1a2e]">₱{total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <button className="h-14 bg-gray-50 border border-gray-200 rounded-md flex flex-col items-center justify-center gap-1 text-[#0f3460] hover:bg-[#0f3460]/5 hover:border-[#0f3460]/30 transition-all">
                  <Banknote size={20} />
                  <span className="text-xs font-medium">Cash</span>
                </button>
                <button className="h-14 bg-gray-50 border border-gray-200 rounded-md flex flex-col items-center justify-center gap-1 text-[#0f3460] hover:bg-[#0f3460]/5 hover:border-[#0f3460]/30 transition-all">
                  <CreditCard size={20} />
                  <span className="text-xs font-medium">Card</span>
                </button>
                <button className="h-14 bg-gray-50 border border-gray-200 rounded-md flex flex-col items-center justify-center gap-1 text-[#0f3460] hover:bg-[#0f3460]/5 hover:border-[#0f3460]/30 transition-all">
                  <SplitSquareHorizontal size={20} />
                  <span className="text-xs font-medium">Split</span>
                </button>
              </div>
              
              <button className="w-full h-[60px] bg-[#f4623a] hover:bg-[#e0522d] text-white rounded-md font-semibold text-lg shadow-md transition-colors flex items-center justify-center gap-2">
                Charge ₱{total.toLocaleString(undefined, {minimumFractionDigits: 2})}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
