export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 1. SETTING RAHASIA - ISI DI CLOUDFLARE SECRETS
    const API_KEY = env.BAYAR_API_KEY;
    const NO_WA_ADMIN = "6289503336000"; // GANTI NOMOR KAMU

    // 2. CORS BIAR WEB KAMU BISA AKSES
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://izul-store.my.id", // GANTI KALO DOMAIN GANTI
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 3. ENDPOINT: BIKIN INVOICE BAYAR.GG
    if (url.pathname === "/create-payment" && request.method === "POST") {
      try {
        const body = await request.json();
        const { produk, harga, nama_pembeli, wa_pembeli } = body;

        const order_id = "IZUL-" + Date.now();
        
        const res = await fetch("https://api.bayar.gg/api/create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: API_KEY,
            order_id: order_id,
            amount: harga,
            product_name: produk,
            customer_name: nama_pembeli,
            customer_email: wa_pembeli + "@izulstore.com"
          })
        });
        const data = await res.json();
        
        if(data.status !== "success"){
          return new Response(JSON.stringify({error: data.message}), { status: 400, headers: corsHeaders });
        }

        // SIMPEN KE KV BIAR WEBHOOK TAU
        await env.DB.put(order_id, JSON.stringify({produk, wa_pembeli, harga}));
        
        return new Response(JSON.stringify({
          status: "success",
          payment_url: data.data.payment_url, // LINK BAYAR.GG
          order_id: order_id
        }), { headers: {...corsHeaders, "Content-Type": "application/json"} });

      } catch(e) {
        return new Response(JSON.stringify({error: e.message}), { status: 500, headers: corsHeaders });
      }
    }

    // 4. ENDPOINT: TERIMA WEBHOOK LUNAS DARI BAYAR.GG
    if (url.pathname === "/webhook" && request.method === "POST") {
      const body = await request.json();
      console.log("Webhook:", body);

      if (body.status === "PAID" || body.status === "LUNAS") {
        const orderData = await env.DB.get(body.order_id);
        if (orderData) {
          const {produk, wa_pembeli, harga} = JSON.parse(orderData);
          
          const pesan = `✅ PEMBAYARAN LUNAS\n\n` +
                        `Produk: ${produk}\n` +
                        `Harga: Rp${harga.toLocaleString('id-ID')}\n\n` +
                        `Ini produk kamu:\n[ISI LINK PRODUK KAMU DISINI]\n\n` +
                        `Terima kasih sudah belanja di Izul Ztore`;
          
          // Kirim WA ke pembeli - pake link. Kalo mau otomatis beneran pake Fonnte
          // Notif ke admin
          await fetch(`https://api.bayar.gg/api/send-whatsapp?api_key=${API_KEY}&to=${NO_WA_ADMIN}&message=Order%20Lunas:%20${body.order_id}`);
        }
        await env.DB.delete(body.order_id);
      }
      return new Response(JSON.stringify({status: "OK"}), { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
}
