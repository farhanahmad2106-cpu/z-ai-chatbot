import { Search, MessageSquare, Download } from "lucide-react";

export default function HistoryPage() {
  const dummyHistory = [
    { id: 1, date: "Oct 24, 2026", title: "Project Brainstorming", messages: 24, size: "1.2 MB" },
    { id: 2, date: "Oct 22, 2026", title: "React Debugging Session", messages: 56, size: "2.5 MB" },
    { id: 3, date: "Oct 20, 2026", title: "Essay Writing Help", messages: 12, size: "0.5 MB" },
    { id: 4, date: "Oct 15, 2026", title: "Code Refactoring", messages: 108, size: "4.8 MB" },
  ];

  return (
    <div className="space-y-6">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Chat History</h1>
          <p className="text-gray-500 mt-2">View and manage your past AI conversations.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search conversations..." 
            className="pl-10 pr-4 py-2 w-full sm:w-64 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-sm"
          />
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 font-semibold text-gray-600 text-sm uppercase tracking-wider">Conversation Title</th>
                <th className="p-4 font-semibold text-gray-600 text-sm uppercase tracking-wider">Date</th>
                <th className="p-4 font-semibold text-gray-600 text-sm uppercase tracking-wider">Messages</th>
                <th className="p-4 font-semibold text-gray-600 text-sm uppercase tracking-wider">Size</th>
                <th className="p-4 font-semibold text-gray-600 text-sm uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dummyHistory.map((chat) => (
                <tr key={chat.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <MessageSquare size={16} />
                    </div>
                    <span className="font-medium text-gray-900">{chat.title}</span>
                  </td>
                  <td className="p-4 text-gray-500">{chat.date}</td>
                  <td className="p-4 text-gray-500">{chat.messages}</td>
                  <td className="p-4 text-gray-500">{chat.size}</td>
                  <td className="p-4 text-right">
                    <button className="p-2 text-gray-400 hover:text-emerald-600 transition-colors opacity-0 group-hover:opacity-100" title="Export Chat">
                      <Download size={18} />
                    </button>
                    <button className="ml-2 px-3 py-1 bg-white border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
