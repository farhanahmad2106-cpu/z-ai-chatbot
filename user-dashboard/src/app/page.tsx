export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
        <p className="text-gray-500 mt-2">Here is what&apos;s happening with your account today.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium">Total Chats</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">1,248</p>
          <p className="text-emerald-500 text-sm mt-2 flex items-center">
            ↑ 12% from last month
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium">Active Subscription</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">Pro Plan</p>
          <p className="text-gray-400 text-sm mt-2 flex items-center">
            Renews in 12 days
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium">Data Storage</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">45%</p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
            <div className="bg-blue-500 h-2 rounded-full" style={{ width: "45%" }}></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Recent Activity</h2>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  AI
                </div>
                <div>
                  <p className="font-medium text-gray-900">Chat session #{1042 - i}</p>
                  <p className="text-sm text-gray-500">Discussed project requirements and UI design.</p>
                </div>
              </div>
              <span className="text-sm text-gray-400">{i * 2} hours ago</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
