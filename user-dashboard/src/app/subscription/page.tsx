import { Check } from "lucide-react";

export default function SubscriptionPage() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Upgrade Your Experience</h1>
        <p className="text-gray-500 mt-3 text-lg">Choose the perfect plan for your AI needs.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Free Plan */}
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
          <h3 className="text-xl font-bold text-gray-900">Basic</h3>
          <p className="text-gray-500 text-sm mt-2">For casual users</p>
          <div className="my-6">
            <span className="text-4xl font-extrabold text-gray-900">$0</span>
            <span className="text-gray-500">/month</span>
          </div>
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-center gap-3 text-gray-700">
              <Check size={20} className="text-green-500" />
              <span>100 messages/day</span>
            </li>
            <li className="flex items-center gap-3 text-gray-700">
              <Check size={20} className="text-green-500" />
              <span>Standard response speed</span>
            </li>
            <li className="flex items-center gap-3 text-gray-700">
              <Check size={20} className="text-green-500" />
              <span>Basic models</span>
            </li>
          </ul>
          <button className="w-full py-3 rounded-xl border border-gray-300 font-bold text-gray-700 hover:bg-gray-50 transition-colors">
            Current Plan
          </button>
        </div>

        {/* Pro Plan */}
        <div className="bg-gradient-to-b from-blue-900 to-gray-900 rounded-3xl p-8 border border-blue-800 shadow-xl relative flex flex-col transform md:-translate-y-4">
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <span className="bg-blue-500 text-white text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full">
              Most Popular
            </span>
          </div>
          <h3 className="text-xl font-bold text-white">Pro</h3>
          <p className="text-blue-200 text-sm mt-2">For power users</p>
          <div className="my-6">
            <span className="text-4xl font-extrabold text-white">$15</span>
            <span className="text-blue-200">/month</span>
          </div>
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-center gap-3 text-gray-300">
              <Check size={20} className="text-blue-400" />
              <span className="text-white">Unlimited messages</span>
            </li>
            <li className="flex items-center gap-3 text-gray-300">
              <Check size={20} className="text-blue-400" />
              <span className="text-white">Fastest response speed</span>
            </li>
            <li className="flex items-center gap-3 text-gray-300">
              <Check size={20} className="text-blue-400" />
              <span className="text-white">Premium models (GPT-4)</span>
            </li>
            <li className="flex items-center gap-3 text-gray-300">
              <Check size={20} className="text-blue-400" />
              <span className="text-white">Priority support</span>
            </li>
          </ul>
          <button className="w-full py-3 rounded-xl bg-blue-500 font-bold text-white hover:bg-blue-400 transition-colors shadow-lg shadow-blue-500/30">
            Upgrade to Pro
          </button>
        </div>

        {/* Enterprise Plan */}
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
          <h3 className="text-xl font-bold text-gray-900">Enterprise</h3>
          <p className="text-gray-500 text-sm mt-2">For large teams</p>
          <div className="my-6">
            <span className="text-4xl font-extrabold text-gray-900">$49</span>
            <span className="text-gray-500">/month</span>
          </div>
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-center gap-3 text-gray-700">
              <Check size={20} className="text-green-500" />
              <span>Everything in Pro</span>
            </li>
            <li className="flex items-center gap-3 text-gray-700">
              <Check size={20} className="text-green-500" />
              <span>Custom model fine-tuning</span>
            </li>
            <li className="flex items-center gap-3 text-gray-700">
              <Check size={20} className="text-green-500" />
              <span>API access</span>
            </li>
            <li className="flex items-center gap-3 text-gray-700">
              <Check size={20} className="text-green-500" />
              <span>24/7 Phone support</span>
            </li>
          </ul>
          <button className="w-full py-3 rounded-xl border-2 border-gray-900 font-bold text-gray-900 hover:bg-gray-900 hover:text-white transition-colors">
            Contact Sales
          </button>
        </div>
      </div>
    </div>
  );
}
