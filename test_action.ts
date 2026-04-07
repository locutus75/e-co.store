import { updateProductAction } from './src/app/actions/product';

const fd = new FormData();
fd.append("weightGr", "20");
fd.append("lengthCm", "");

updateProductAction("2061", fd).then(() => console.log("Success")).catch(e => console.error("Error", e.message));
