export interface Quote {
  id: string;
  text: string;
  author: string;
  category: 'health' | 'mindset' | 'perseverance' | 'wellness';
}

export const MOTIVATIONAL_QUOTES: Quote[] = [
  {
    id: 'q1',
    text: "The body achieves what the mind believes.",
    author: "Napoleon Hill",
    category: "mindset"
  },
  {
    id: 'q2',
    text: "Take care of your body. It's the only place you have to live.",
    author: "Jim Rohn",
    category: "health"
  },
  {
    id: 'q3',
    text: "Small daily improvements over time lead to stunning results.",
    author: "Robin Sharma",
    category: "perseverance"
  },
  {
    id: 'q4',
    text: "Health is a state of complete harmony of the body, mind and spirit.",
    author: "B.K.S. Iyengar",
    category: "wellness"
  },
  {
    id: 'q5',
    text: "Action is the foundational key to all success.",
    author: "Pablo Picasso",
    category: "perseverance"
  },
  {
    id: 'q6',
    text: "To ensure good health: eat lightly, breathe deeply, live moderately, cultivate cheerfulness, and maintain an interest in life.",
    author: "William Londen",
    category: "health"
  },
  {
    id: 'q7',
    text: "It always seems impossible until it's done.",
    author: "Nelson Mandela",
    category: "perseverance"
  },
  {
    id: 'q8',
    text: "Your health is an investment, not an expense.",
    author: "Anonymous",
    category: "health"
  },
  {
    id: 'q9',
    text: "Happiness is the highest form of health.",
    author: "Dalai Lama",
    category: "wellness"
  },
  {
    id: 'q10',
    text: "Do something today that your future self will thank you for.",
    author: "Sean Patrick Flanery",
    category: "mindset"
  },
  {
    id: 'q11',
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
    category: "perseverance"
  },
  {
    id: 'q12',
    text: "Consistency is what transforms average into excellence.",
    author: "Tony Robbins",
    category: "perseverance"
  }
];
