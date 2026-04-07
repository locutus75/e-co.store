const url = new URL("postgresql://usr:K5G47md%23gd8%212snghyfuDh@localhost/db");
console.log("Password from URL:", url.password);
console.log("Re-encoded Password:", encodeURIComponent(url.password));
console.log("Decoded then encoded:", encodeURIComponent(decodeURIComponent(url.password)));
