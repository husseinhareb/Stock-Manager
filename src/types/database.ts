// Database types
export type Article = {
  id: number;
  name: string;
  quantity: number;
  position: number;
};

export type Price = {
  article_id: number;
  price: number;
};

export type ClientItem = {
  article_id: number;
  quantity: number;
  name: string;
  price: number;
};

export type ClientPin = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
};

export type SavedClientSummary = {
  id: number;
  client: string;
  created_at: number;
  total: number;
};

export type SavedClientItem = {
  article_id: number;
  name: string;
  quantity: number;
  price: number;
};
