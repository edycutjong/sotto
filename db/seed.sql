-- Clear existing seed data for auction 101
DELETE FROM public.sotto_auction_bids WHERE auction_id = 101;

-- Insert seed bids
INSERT INTO public.sotto_auction_bids (auction_id, bidder_address, commitment_hash, encrypted_bid)
VALUES 
(101, 'GS111', '7e662d8f7a3935e5a39e81ab3d0adbc1bdcde05bae50ffe37aa61217e0c902cb', 'ECIES-Secp256k1[{"amount": 720000, "salt": 829482}]'),
(101, 'GS222', 'fb1a1fd789ef33fd20e6f4dc2a7b6c18974a2d1bf77d045ebe01fae705ebaa65', 'ECIES-Secp256k1[{"amount": 650000, "salt": 192849}]'),
(101, 'GS333', '1aaa23d2c902c1fb88594ec9090ca24f8e6fa82f2052050f332fb2abfdf67db2', 'ECIES-Secp256k1[{"amount": 800000, "salt": 928471}]');
