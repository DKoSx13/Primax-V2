SELECT json_build_object(
 'orders',(SELECT count(*) FROM "OnlineOrder"),
 'payments',(SELECT count(*) FROM "Payment"),
 'authorizations',(SELECT count(*) FROM "FuelAuthorization"),
 'sales',(SELECT count(*) FROM "Transaction"),
 'receipts',(SELECT count(*) FROM "Receipt"),
 'reservations',(SELECT count(*) FROM "InventoryReservation"),
 'totalCapturedPEN',(SELECT sum(amount) FROM "Payment" WHERE status='CAPTURED'),
 'totalPaidPEN',(SELECT sum(amount) FROM "Transaction" WHERE status='PAID'),
 'events',(SELECT json_object_agg(kind,n) FROM (SELECT kind,count(*) AS n FROM "PaymentEvent" GROUP BY kind) grouped));
