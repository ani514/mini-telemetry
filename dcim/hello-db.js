// imports the Supabase client library so we can establish a connection between
// Supabase and our project.
import { createClient } from '@supabase/supabase-js'; 

// importing everything from our .env file instead of copy-pasting the URL and key here
// so the credentials can live outside the code and won't leak.
import 'dotenv/config'; // 

// creating an instance of the aforementioned connection. 
// creating said client with the service key bypasses RLS even when it's enabled, 
// so the backend script can read the tables.
const supabaseUrl = createClient(
    process.env.SUPABASE_URL,   
    process.env.SUPABASE_SERVICE_KEY
);

// database calls take time, so we need to use the 
// await keyword, which requires an async wrapper. 
async function main() {

    // run "SELECT * FROM readings" against Supabase and pull apart the response.
    // the client returns BOTH the rows (data) and any failure (error) together,
    // so we destructure both. '*' = all columns; no filter = all rows.
    // 'await' pauses until the database responds.
    const{data, error} = await supabaseUrl.from('readings').select('*');

    // error-first handling: check whether the query failed before trusting data.
    // if something went wrong, report it and stop; don't let it fall through code.
    // that assumes we got valid rows back.
    if(error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log('Readings:', data);
}

main(); 
