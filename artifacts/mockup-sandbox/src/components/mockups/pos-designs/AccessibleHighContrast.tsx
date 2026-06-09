import React, { useState } from 'react';
import { 
  Calculator, Package, Users, BarChart3, Settings, HelpCircle, 
  Search, Bell, Plus, Minus, CreditCard, Banknote, 
  Wifi, Clock, AlertTriangle, CheckCircle2, ChevronRight, ShoppingCart, Calendar
} from 'lucide-react';

const navItems = [
  { name: 'POS Register', icon: Calculator, active: true },
  { name: 'Products', icon: Package, active: false },
  { name: 'Customers', icon: Users, active: false },
  { name: 'Reports', icon: BarChart3, active: false },
  { name: 'Settings', icon: Settings, active: false },
  { name: 'Help', icon: HelpCircle, active: false },
];

const categories = ['ALL', 'COFFEE', 'FOOD', 'DRINKS', 'DESSERTS'];

const products = [
  { id: 1, name: 'Coffee', price: 90, category: 'COFFEE' },
  { id: 2, name: 'Latte', price: 125, category: 'COFFEE' },
  { id: 3, name: 'Tea', price: 75, category: 'DRINKS' },
  { id: 4, name: 'Sandwich', price: 180, category: 'FOOD' },
  { id: 5, name: 'Cake Slice', price: 110, category: 'DESSERTS' },
];

export function AccessibleHighContrast() {
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [orderItems, setOrderItems] = useState([
    { id: 1, name: 'Coffee', price: 90, quantity: 2 },
    { id: 4, name: 'Sandwich', price: 180, quantity: 1 },
  ]);

  const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.12;
  const total = subtotal + tax;

  return (
    <div className="flex flex-col h-screen bg-[#ffffff] text-[#000000] font-sans selection:bg-[#ffdd00] selection:text-[#000000]" style={{ lineHeight: 1.6 }}>
      
      {/* Top Bar */}
      <header className="h-[80px] border-b-4 border-[#1e3a5f] px-6 flex items-center justify-between shrink-0 bg-[#ffffff]">
        <div className="flex items-center gap-4">
          <div className="bg-[#1e3a5f] text-[#ffffff] p-3 rounded font-bold text-2xl tracking-wider flex items-center gap-2">
            <ShoppingCart size={32} />
            <span className="leading-none">ARTIX POS</span>
          </div>
          <h1 className="text-[24px] font-bold text-[#1e3a5f] ml-4 border-l-4 border-[#374151] pl-4">
            Main Branch
          </h1>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 text-[#000000] font-bold text-[18px]">
            <Users size={28} className="text-[#1e3a5f]" />
            Cashier: Maria Santos
          </div>
          <div className="flex items-center gap-2 text-[#000000] font-bold text-[24px] bg-[#f0f4f8] px-4 py-2 border-2 border-[#374151] rounded">
            <Clock size={28} className="text-[#1e3a5f]" />
            14:35 PM
          </div>
          <button className="relative flex items-center justify-center gap-2 h-[56px] px-6 bg-[#ffffff] border-2 border-[#1e3a5f] text-[#1e3a5f] font-bold rounded hover:bg-[#f0f4f8] focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2">
            <Bell size={28} />
            <span className="text-[18px]">Notifications</span>
            <span className="absolute -top-3 -right-3 bg-[#cc0000] text-[#ffffff] text-[14px] font-bold px-3 py-1 rounded-full border-2 border-[#ffffff]">
              3
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <nav className="w-[280px] bg-[#f0f4f8] border-r-4 border-[#374151] shrink-0 flex flex-col py-6">
          <div className="flex-1 space-y-2 px-4">
            {navItems.map((item) => (
              <button
                key={item.name}
                className={`w-full flex items-center gap-4 px-4 h-[64px] rounded font-bold text-[18px] focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2 transition-colors ${
                  item.active 
                    ? 'bg-[#1e3a5f] text-[#ffffff] border-l-8 border-[#ffdd00]' 
                    : 'bg-[#ffffff] text-[#000000] border-2 border-[#374151] hover:bg-[#e2e8f0]'
                }`}
              >
                <item.icon size={28} className={item.active ? 'text-[#ffffff]' : 'text-[#1e3a5f]'} aria-hidden="true" />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          
          <div className="px-4 mt-auto">
            <div className="bg-[#ffffff] border-2 border-[#006600] p-4 rounded text-[#006600] flex items-center gap-3 font-bold text-[16px]">
              <CheckCircle2 size={24} aria-hidden="true" />
              <span>System Optimal</span>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#ffffff]">
          
          <div className="p-6 shrink-0 border-b-2 border-[#374151]">
            {/* Search */}
            <div className="relative mb-6">
              <label htmlFor="search-products" className="sr-only">Search products</label>
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <Search size={28} className="text-[#1e3a5f]" aria-hidden="true" />
              </div>
              <input
                id="search-products"
                type="text"
                className="block w-full h-[64px] pl-14 pr-4 bg-[#ffffff] border-4 border-[#1e3a5f] rounded text-[20px] font-bold text-[#000000] placeholder:text-[#374151] focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2"
                placeholder="Search products by name or SKU..."
              />
            </div>

            {/* Categories */}
            <div className="flex gap-4 overflow-x-auto pb-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`h-[56px] px-8 font-bold text-[18px] uppercase tracking-wider whitespace-nowrap rounded focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2 transition-colors ${
                    activeCategory === cat
                      ? 'bg-[#1e3a5f] text-[#ffffff] border-4 border-[#1e3a5f]'
                      : 'bg-[#ffffff] text-[#1e3a5f] border-4 border-[#1e3a5f] hover:bg-[#f0f4f8]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#f0f4f8]">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map(product => (
                <div key={product.id} className="bg-[#ffffff] border-4 border-[#374151] rounded flex flex-col overflow-hidden">
                  <div className="h-[120px] bg-[#e2e8f0] border-b-4 border-[#374151] flex items-center justify-center p-4">
                    <Package size={48} className="text-[#1e3a5f]" aria-hidden="true" />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-[20px] text-[#000000] leading-tight mb-2">{product.name}</h3>
                      <div className="font-extrabold text-[28px] text-[#1e3a5f]">₱{product.price}</div>
                    </div>
                    <button className="w-full h-[56px] bg-[#1e3a5f] text-[#ffffff] font-bold text-[18px] flex items-center justify-center gap-2 rounded focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2 hover:bg-[#112240]">
                      <Plus size={24} aria-hidden="true" />
                      ADD TO ORDER
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Right Panel - Current Order */}
        <aside className="w-[480px] bg-[#ffffff] border-l-4 border-[#374151] shrink-0 flex flex-col">
          <div className="h-[80px] border-b-4 border-[#374151] flex items-center px-6 bg-[#1e3a5f] text-[#ffffff]">
            <h2 className="font-extrabold text-[24px] uppercase tracking-widest flex items-center gap-3">
              <ShoppingCart size={32} />
              Current Order
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {orderItems.map(item => (
              <div key={item.id} className="border-4 border-[#374151] rounded p-4 flex flex-col gap-4 bg-[#f0f4f8]">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-[20px] text-[#000000]">{item.name}</h3>
                  <span className="font-extrabold text-[20px] text-[#1e3a5f]">₱{item.price * item.quantity}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[16px] text-[#374151]">₱{item.price} each</span>
                  <div className="flex items-center gap-4 bg-[#ffffff] border-2 border-[#374151] rounded p-1">
                    <button 
                      aria-label={`Decrease quantity of ${item.name}`}
                      className="w-[48px] h-[48px] flex items-center justify-center bg-[#f0f4f8] border-2 border-[#374151] rounded text-[#1e3a5f] hover:bg-[#e2e8f0] focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2"
                    >
                      <Minus size={24} aria-hidden="true" />
                    </button>
                    <span className="font-extrabold text-[24px] w-[40px] text-center">{item.quantity}</span>
                    <button 
                      aria-label={`Increase quantity of ${item.name}`}
                      className="w-[48px] h-[48px] flex items-center justify-center bg-[#1e3a5f] border-2 border-[#1e3a5f] rounded text-[#ffffff] hover:bg-[#112240] focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2"
                    >
                      <Plus size={24} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totals & Payment */}
          <div className="border-t-4 border-[#374151] p-6 bg-[#f0f4f8] shrink-0">
            <div className="space-y-3 mb-6 border-b-4 border-[#374151] pb-6">
              <div className="flex justify-between items-center text-[18px] font-bold text-[#374151]">
                <span>Subtotal</span>
                <span>₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-[18px] font-bold text-[#374151]">
                <span>Tax (12%)</span>
                <span>₱{tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-[32px] font-extrabold text-[#000000] pt-4">
                <span>TOTAL</span>
                <span className="text-[#cc0000]">₱{total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <button className="h-[72px] bg-[#ffffff] border-4 border-[#1e3a5f] text-[#1e3a5f] font-extrabold text-[20px] rounded flex items-center justify-center gap-3 hover:bg-[#f0f4f8] focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2">
                  <Banknote size={32} aria-hidden="true" />
                  PAY CASH
                </button>
                <button className="h-[72px] bg-[#ffffff] border-4 border-[#1e3a5f] text-[#1e3a5f] font-extrabold text-[20px] rounded flex items-center justify-center gap-3 hover:bg-[#f0f4f8] focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2">
                  <CreditCard size={32} aria-hidden="true" />
                  PAY CARD
                </button>
              </div>
              
              <button className="w-full h-[80px] bg-[#006600] text-[#ffffff] font-extrabold text-[24px] uppercase tracking-wider rounded flex items-center justify-center gap-3 hover:bg-[#004d00] focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:ring-offset-2">
                <CheckCircle2 size={32} aria-hidden="true" />
                COMPLETE SALE
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Status Strip */}
      <footer className="h-[56px] bg-[#1e3a5f] text-[#ffffff] flex items-center justify-between px-6 shrink-0 border-t-4 border-[#ffffff]">
        <div className="flex items-center gap-8 font-bold text-[16px]">
          <div className="flex items-center gap-2">
            <Wifi size={24} aria-hidden="true" />
            <span>Terminal Online</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={24} aria-hidden="true" />
            <span>Oct 24, 2023</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={24} aria-hidden="true" />
            <span>Shift: 8:00 AM - 5:00 PM</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-[#ffffff] font-bold text-[16px]">
          <AlertTriangle size={24} aria-hidden="true" />
          <span>Battery: 85%</span>
        </div>
      </footer>

    </div>
  );
}
