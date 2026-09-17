import Link from "next/link";
import { Home, User, History, CreditCard, HelpCircle, Settings } from "lucide-react";
import { SignedIn, SignedOut, UserButton, SignInButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";

export default async function Sidebar() {
  const user = await currentUser();
  const isAdmin = user?.primaryEmailAddress?.emailAddress === "farhanahmad2106@gmail.com";

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-screen fixed">
      <div className="p-6">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
          Z-AI User
        </h2>
      </div>
      <nav className="flex-1 mt-6">
        <ul className="space-y-2 px-4">
          <li>
            <Link
              href="/"
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Home size={20} className="text-blue-400" />
              <span>Dashboard</span>
            </Link>
          </li>
          <li>
            <Link
              href="/profile"
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <User size={20} className="text-purple-400" />
              <span>Profile</span>
            </Link>
          </li>
          <li>
            <Link
              href="/history"
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <History size={20} className="text-emerald-400" />
              <span>History</span>
            </Link>
          </li>
          <li>
            <Link
              href="/subscription"
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <CreditCard size={20} className="text-yellow-400" />
              <span>Subscription</span>
            </Link>
          </li>
          <li>
            <Link
              href="/support"
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <HelpCircle size={20} className="text-rose-400" />
              <span>Support</span>
            </Link>
          </li>
          {isAdmin && (
            <li>
              <Link
                href="/admin"
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-900/40 border border-indigo-500/30 hover:bg-indigo-900/60 transition-colors mt-4"
              >
                <Settings size={20} className="text-indigo-400" />
                <span className="font-semibold text-indigo-100">Admin Panel</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>
      <div className="p-6">
        <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700 flex items-center justify-center">
          <SignedIn>
            <UserButton showName appearance={{ elements: { userButtonBox: "flex-row-reverse text-white", userButtonOuterIdentifier: "text-white font-semibold ml-2" } }} />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="text-white font-semibold hover:text-blue-400 transition-colors">Sign In</button>
            </SignInButton>
          </SignedOut>
        </div>
      </div>
    </div>
  );
}
