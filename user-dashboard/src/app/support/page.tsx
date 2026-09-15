import { Mail, MessageCircle, FileText } from "lucide-react";

export default function SupportPage() {
  const faqs = [
    { q: "How do I reset my password?", a: "You can reset your password by going to the login page and clicking 'Forgot Password'." },
    { q: "Where can I view my chat history?", a: "Your chat history is available in the 'History' tab on the sidebar." },
    { q: "How do I upgrade my subscription?", a: "Navigate to the 'Subscription' tab and select the plan you'd like to upgrade to." },
    { q: "Is my data secure?", a: "Yes, we use industry-standard encryption to ensure your data and conversations are completely private." },
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900">How can we help you?</h1>
        <p className="text-gray-500 mt-2">Search our knowledge base or reach out to our support team.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center hover:shadow-md transition-shadow cursor-pointer">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
            <FileText size={24} />
          </div>
          <h3 className="font-bold text-gray-900">Documentation</h3>
          <p className="text-sm text-gray-500 mt-2">Detailed guides and API references.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center hover:shadow-md transition-shadow cursor-pointer">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
            <MessageCircle size={24} />
          </div>
          <h3 className="font-bold text-gray-900">Community Forum</h3>
          <p className="text-sm text-gray-500 mt-2">Connect with other users and share tips.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center hover:shadow-md transition-shadow cursor-pointer">
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-4">
            <Mail size={24} />
          </div>
          <h3 className="font-bold text-gray-900">Email Support</h3>
          <p className="text-sm text-gray-500 mt-2">Get personalized help from our team.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
        <div className="space-y-6">
          {faqs.map((faq, index) => (
            <div key={index} className="pb-6 border-b border-gray-100 last:border-0 last:pb-0">
              <h3 className="text-lg font-medium text-gray-900 mb-2">{faq.q}</h3>
              <p className="text-gray-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
