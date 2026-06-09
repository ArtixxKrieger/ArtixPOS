import { useState, useEffect } from "react";
import { 
  Bell, 
  Clock, 
  Menu, 
  LayoutGrid, 
  ClipboardList, 
  Users, 
  BarChart2, 
  Settings,
  Plus,
  Minus,
  Tag,
  Pause,
  SplitSquareHorizontal,
  Coffee,
  Croissant,
  CupSoda,
  Utensils
} from "lucide-react";

export function ModernColorful() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const categories = [
    { id: 'coffee', name: 'Coffee', icon: '☕', color: 'bg-amber-100 text-amber-900 border-amber-300' },
    { id: 'bakery', name: 'Bakery', icon: '🍞', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
    { id: 'cold', name: 'Cold Drinks', icon: '🥤', color: 'bg-blue-100 text-blue-900 border-blue-300' },
    { id: 'mains', name: 'Mains', icon: '🍜', color: 'bg-rose-100 text-rose-900 border-rose-300' },
  ];

  const products = [
    { id: 1, name: 'Americano', price: 90, category: 'coffee' },
    { id: 2, name: 'Cappuccino', price: 120, category: 'coffee' },
    { id: 3, name: 'Latte', price: 130, category: 'coffee' },
    { id: 4, name: 'Croissant', price: 75, category: 'bakery' },
    { id: 5, name: 'Muffin', price: 85, category: 'bakery' },
    { id: 6, name: 'Iced Matcha', price: 145, category: 'cold' },
    { id: 7, name: 'Iced Tea', price: 95, category: 'cold' },
    { id: 8, name: 'Sandwich', price: 185, category: 'mains' },
    { id: 9, name: 'Pasta', price: 220, category: 'mains' },
  ];

  const orderItems = [
    { id: 1, name: 'Cappuccino', price: 120, qty: 2 },
    { id: 2, name: 'Croissant', price: 75, qty: 1 },
    { id: 3, name: 'Iced Matcha', price: 145, qty: 1 },
  ];

  const getCategoryColor = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.color : 'bg-gray-100 text-gray-900 border-gray-300';
  };

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = subtotal * 0.12; // 12% VAT
  const total = subtotal + tax;

  return (
    <div className="flex h-screen w-full bg-white font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-[220px] bg-[#1c1c2e] text-slate-300 flex flex-col flex-shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ff6b35] to-[#f7c59f] flex items-center justify-center text-white font-bold text-xl">
            T
          </div>
          <span className="text-xl font-bold text-white tracking-wide">TOAST</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <div className="px-3 py-3 rounded-xl bg-slate-800/50 text-white flex items-center gap-3 border-l-4 border-[#ff6b35] font-medium cursor-pointer transition-colors">
            <LayoutGrid className="w-5 h-5 text-[#ff6b35]" />
            Register
          </div>
          <div className="px-4 py-3 rounded-xl hover:bg-slate-800/30 flex items-center gap-3 font-medium cursor-pointer transition-colors">
            <ClipboardList className="w-5 h-5" />
            Orders
          </div>
          <div className="px-4 py-3 rounded-xl hover:bg-slate-800/30 flex items-center gap-3 font-medium cursor-pointer transition-colors">
            <Menu className="w-5 h-5" />
            Menu
          </div>
          <div className="px-4 py-3 rounded-xl hover:bg-slate-800/30 flex items-center gap-3 font-medium cursor-pointer transition-colors">
            <Users className="w-5 h-5" />
            Guests
          </div>
          <div className="px-4 py-3 rounded-xl hover:bg-slate-800/30 flex items-center gap-3 font-medium cursor-pointer transition-colors">
            <BarChart2 className="w-5 h-5" />
            Reports
          </div>
          <div className="px-4 py-3 rounded-xl hover:bg-slate-800/30 flex items-center gap-3 font-medium cursor-pointer transition-colors">
            <Settings className="w-5 h-5" />
            Settings
          </div>
        </nav>

        <div className="p-4 space-y-2 border-t border-slate-700/50">
          <button className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium flex items-center gap-2 transition-colors">
            <Tag className="w-4 h-4 text-emerald-400" />
            Quick Discount
          </button>
          <button className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium flex items-center gap-2 transition-colors">
            <Pause className="w-4 h-4 text-amber-400" />
            Hold Order
          </button>
          <button className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium flex items-center gap-2 transition-colors">
            <SplitSquareHorizontal className="w-4 h-4 text-blue-400" />
            Split Bill
          </button>
        </div>

        <div className="p-4 bg-slate-900/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold shrink-0">
            AR
          </div>
          <div className="overflow-hidden">
            <div className="text-white font-medium truncate">Alex R.</div>
            <div className="text-xs text-slate-400">Cashier</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {/* Top Bar */}
        <div className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
          <div className="text-lg font-medium text-slate-700 flex items-center gap-2">
            Register <span className="text-slate-400">{'>'}</span> <span className="text-[#ff6b35]">Table 4</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-sm font-medium">
              3 Open Tables
            </div>
            <div className="flex items-center gap-2 text-slate-600 font-medium">
              <Clock className="w-5 h-5" />
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <button className="p-2 relative text-slate-400 hover:text-slate-600 transition-colors">
              <Bell className="w-6 h-6" />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="px-6 py-4 overflow-x-auto shrink-0 flex gap-4 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`flex items-center gap-3 px-6 py-4 rounded-xl text-lg font-bold border-2 whitespace-nowrap transition-transform active:scale-95 shadow-sm ${
                cat.id === 'coffee' 
                  ? 'bg-amber-50 border-amber-400 text-amber-900' 
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="text-2xl">{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map(product => (
              <button
                key={product.id}
                className={`relative flex flex-col justify-between p-4 h-32 rounded-xl text-left transition-transform active:scale-95 shadow-sm border ${getCategoryColor(product.category)} overflow-hidden`}
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-current opacity-20"></div>
                <div className="font-bold text-lg leading-tight line-clamp-2 pr-2">{product.name}</div>
                <div className="text-xl font-black mt-2">₱{product.price}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Order Panel */}
      <div className="w-[350px] lg:w-[400px] bg-[#1c1c2e] flex flex-col flex-shrink-0 shadow-2xl relative z-10">
        <div className="p-6 border-b border-slate-700/50 flex-shrink-0">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-xl font-bold text-white">Current Order</h2>
            <span className="text-slate-400 text-sm">#1042</span>
          </div>
          <div className="text-[#ff6b35] font-medium">Table 4</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {orderItems.map(item => (
            <div key={item.id} className="bg-slate-800/50 rounded-xl p-3 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className="font-medium text-white text-lg">{item.name}</div>
                <div className="font-bold text-white text-lg">₱{item.price * item.qty}</div>
              </div>
              <div className="flex justify-between items-center">
                <div className="text-slate-400 text-sm">₱{item.price} each</div>
                <div className="flex items-center gap-3 bg-slate-900/50 rounded-full p-1">
                  <button className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600 transition-colors">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-bold text-white">{item.qty}</span>
                  <button className="w-8 h-8 rounded-full bg-[#ff6b35] text-white flex items-center justify-center hover:bg-[#ff8c61] transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-slate-900 border-t border-slate-700/50 flex-shrink-0">
          <div className="space-y-2 mb-6 text-lg">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span>₱{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Tax (12%)</span>
              <span>₱{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-white font-black text-3xl pt-2 pb-2">
              <span>Total</span>
              <span className="text-[#ff6b35]">₱{total.toFixed(2)}</span>
            </div>
          </div>
          
          <button className="w-full h-16 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#f7c59f] text-white font-bold text-2xl shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
            Charge
          </button>
        </div>
      </div>
    </div>
  );
}
