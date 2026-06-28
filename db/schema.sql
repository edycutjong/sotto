-- Create sotto_auction_bids table
CREATE TABLE IF NOT EXISTS public.sotto_auction_bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id INTEGER NOT NULL,
    bidder_address VARCHAR(56) NOT NULL,
    commitment_hash CHAR(64) UNIQUE NOT NULL,
    encrypted_bid TEXT NOT NULL,       -- Encrypted bid details (Amount, Salt)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexing for fast lookups by auction_id and commitment
CREATE INDEX IF NOT EXISTS idx_sotto_auction_bids_auction_id ON public.sotto_auction_bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_sotto_auction_bids_commitment_hash ON public.sotto_auction_bids(commitment_hash);

-- Enable RLS
ALTER TABLE public.sotto_auction_bids ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY read_policy ON public.sotto_auction_bids FOR SELECT TO public USING (true);
CREATE POLICY insert_policy ON public.sotto_auction_bids FOR INSERT TO public WITH CHECK (true);
