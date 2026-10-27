// Biblioteca de 30 almuerzos para sugerir a los clientes. Cada uno lleva los ingredientes con una palabra clave:
// la tienda busca esa palabra entre sus propios productos y muestra solo lo que de verdad vende.
// Archivo .js aparte (Fast Refresh). El dibujo es un emoji sobre un color; el dueño puede subir su propia foto del plato.

const i = (n, k) => ({ n, k })       // ingrediente: nombre para mostrar + palabra clave para buscar en la tienda

export const TIPOS_MENU = ['Res', 'Pollo', 'Cerdo', 'Pescado', 'Sopas', 'Granos', 'Huevo', 'Pasta', 'Rápidos']

export const COLOR_TIPO = {
  Res: ['#7c2d12', '#b45309'], Pollo: ['#b45309', '#f59e0b'], Cerdo: ['#9f1239', '#e11d48'], Pescado: ['#0e7490', '#06b6d4'],
  Sopas: ['#92400e', '#d97706'], Granos: ['#3f6212', '#84cc16'], Huevo: ['#a16207', '#facc15'], Pasta: ['#b91c1c', '#f97316'], 'Rápidos': ['#4c1d95', '#a855f7'],
}

export const MENUS = [
  { id: 'carne-guisada', tipo: 'Res', emoji: '🥘', nombre: 'Carne guisada con arroz y ensalada', descripcion: 'Carne de res tierna en su salsa de cebolla y tomate, con arroz blanco, plátano maduro y ensalada fresca.',
    ingredientes: [i('Carne de res', 'carne'), i('Arroz', 'arroz'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Ajo', 'ajo'), i('Plátano maduro', 'platano'), i('Aceite', 'aceite'), i('Sal', 'sal')] },
  { id: 'bistec-caballo', tipo: 'Res', emoji: '🍳', nombre: 'Bistec a caballo', descripcion: 'Bistec de res encebollado con huevo frito encima, arroz, papas fritas y ensalada.',
    ingredientes: [i('Carne de res', 'carne'), i('Huevos', 'huevo'), i('Arroz', 'arroz'), i('Papa', 'papa'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Aceite', 'aceite')] },
  { id: 'sobrebarriga', tipo: 'Res', emoji: '🥩', nombre: 'Sobrebarriga en salsa criolla', descripcion: 'Sobrebarriga suave en salsa criolla de cebolla, tomate y ajo, con arroz, yuca cocida y ensalada.',
    ingredientes: [i('Sobrebarriga o carne de res', 'sobrebarriga'), i('Arroz', 'arroz'), i('Yuca', 'yuca'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Ajo', 'ajo')] },
  { id: 'carne-molida-papas', tipo: 'Res', emoji: '🍲', nombre: 'Carne molida con papas', descripcion: 'Carne molida sazonada con papas en cubos, arroz blanco y rodajas de aguacate.',
    ingredientes: [i('Carne molida', 'molida'), i('Papa', 'papa'), i('Arroz', 'arroz'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Aguacate', 'aguacate')] },
  { id: 'posta-negra', tipo: 'Res', emoji: '🥩', nombre: 'Posta negra con arroz y patacón', descripcion: 'Posta en salsa oscura y dulce, estilo cartagenero, con arroz, patacón y ensalada.',
    ingredientes: [i('Posta de res', 'posta'), i('Panela', 'panela'), i('Arroz', 'arroz'), i('Plátano verde', 'platano'), i('Cebolla', 'cebolla'), i('Aceite', 'aceite')] },
  { id: 'pollo-guisado', tipo: 'Pollo', emoji: '🍗', nombre: 'Pollo guisado con arroz', descripcion: 'Presas de pollo guisadas con cebolla, tomate y papa, acompañadas de arroz y ensalada.',
    ingredientes: [i('Pollo', 'pollo'), i('Arroz', 'arroz'), i('Papa', 'papa'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Ajo', 'ajo'), i('Aceite', 'aceite')] },
  { id: 'arroz-con-pollo', tipo: 'Pollo', emoji: '🍚', nombre: 'Arroz con pollo', descripcion: 'Arroz amarillo con pollo, zanahoria, arveja y pimentón. Un plato completo para toda la familia.',
    ingredientes: [i('Pollo', 'pollo'), i('Arroz', 'arroz'), i('Zanahoria', 'zanahoria'), i('Arveja', 'arveja'), i('Pimentón', 'pimenton'), i('Cebolla', 'cebolla'), i('Aceite', 'aceite')] },
  { id: 'pollo-asado', tipo: 'Pollo', emoji: '🍗', nombre: 'Pollo asado con papas al horno', descripcion: 'Pollo sazonado al horno con papas doradas y ensalada de lechuga y tomate.',
    ingredientes: [i('Pollo', 'pollo'), i('Papa', 'papa'), i('Ajo', 'ajo'), i('Limón', 'limon'), i('Lechuga', 'lechuga'), i('Tomate', 'tomate'), i('Aceite', 'aceite')] },
  { id: 'pechuga-plancha', tipo: 'Pollo', emoji: '🥗', nombre: 'Pechuga a la plancha con ensalada', descripcion: 'Pechuga jugosa a la plancha con arroz y una ensalada fresca. Ligero y rápido.',
    ingredientes: [i('Pechuga de pollo', 'pechuga'), i('Arroz', 'arroz'), i('Lechuga', 'lechuga'), i('Tomate', 'tomate'), i('Limón', 'limon'), i('Aceite', 'aceite')] },
  { id: 'pollo-frito', tipo: 'Pollo', emoji: '🍟', nombre: 'Pollo frito con patacones', descripcion: 'Pollo apanado y crujiente con patacones, arroz y ensalada.',
    ingredientes: [i('Pollo', 'pollo'), i('Harina', 'harina'), i('Plátano verde', 'platano'), i('Arroz', 'arroz'), i('Huevos', 'huevo'), i('Aceite', 'aceite'), i('Sal', 'sal')] },
  { id: 'pollo-sudado', tipo: 'Pollo', emoji: '🍲', nombre: 'Pollo sudado con yuca', descripcion: 'Pollo cocinado a fuego lento con papa, cebolla y tomate, servido con yuca y arroz.',
    ingredientes: [i('Pollo', 'pollo'), i('Yuca', 'yuca'), i('Papa', 'papa'), i('Arroz', 'arroz'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Cilantro', 'cilantro')] },
  { id: 'chuleta-cerdo', tipo: 'Cerdo', emoji: '🥓', nombre: 'Chuleta de cerdo con arroz y fríjoles', descripcion: 'Chuleta de cerdo dorada con arroz blanco, fríjoles y tajadas de plátano maduro.',
    ingredientes: [i('Chuleta de cerdo', 'chuleta'), i('Arroz', 'arroz'), i('Fríjol', 'frijol'), i('Plátano maduro', 'platano'), i('Ajo', 'ajo'), i('Aceite', 'aceite')] },
  { id: 'costillas', tipo: 'Cerdo', emoji: '🍖', nombre: 'Costillas BBQ con papa criolla', descripcion: 'Costillas de cerdo en salsa BBQ casera con papa criolla y ensalada de repollo.',
    ingredientes: [i('Costilla de cerdo', 'costilla'), i('Salsa BBQ o de tomate', 'salsa'), i('Papa criolla', 'papa'), i('Repollo', 'repollo'), i('Zanahoria', 'zanahoria'), i('Ajo', 'ajo')] },
  { id: 'cerdo-arroz-coco', tipo: 'Cerdo', emoji: '🥘', nombre: 'Cerdo guisado con arroz de coco', descripcion: 'Cerdo en trozos guisado con hogao, acompañado de arroz de coco y plátano.',
    ingredientes: [i('Carne de cerdo', 'cerdo'), i('Arroz', 'arroz'), i('Coco', 'coco'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Plátano', 'platano')] },
  { id: 'pescado-frito', tipo: 'Pescado', emoji: '🐟', nombre: 'Pescado frito con arroz de coco y patacón', descripcion: 'Mojarra o pargo frito, arroz de coco, patacón y ensalada. El plato favorito de la costa.',
    ingredientes: [i('Pescado', 'pescado'), i('Arroz', 'arroz'), i('Coco', 'coco'), i('Plátano verde', 'platano'), i('Limón', 'limon'), i('Ajo', 'ajo'), i('Aceite', 'aceite')] },
  { id: 'sudado-pescado', tipo: 'Pescado', emoji: '🍲', nombre: 'Sudado de pescado', descripcion: 'Pescado en salsa suave de tomate, cebolla y cilantro, con arroz y yuca.',
    ingredientes: [i('Pescado', 'pescado'), i('Arroz', 'arroz'), i('Yuca', 'yuca'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Cilantro', 'cilantro')] },
  { id: 'arroz-atun', tipo: 'Pescado', emoji: '🐠', nombre: 'Arroz con atún', descripcion: 'Arroz suelto con atún, cebolla y pimentón. Económico, rápido y delicioso.',
    ingredientes: [i('Atún', 'atun'), i('Arroz', 'arroz'), i('Cebolla', 'cebolla'), i('Pimentón', 'pimenton'), i('Tomate', 'tomate'), i('Aceite', 'aceite')] },
  { id: 'sancocho-pollo', tipo: 'Sopas', emoji: '🍲', nombre: 'Sancocho de pollo', descripcion: 'Sopa espesa de pollo con yuca, papa, plátano y mazorca, con arroz aparte.',
    ingredientes: [i('Pollo', 'pollo'), i('Yuca', 'yuca'), i('Papa', 'papa'), i('Plátano', 'platano'), i('Mazorca', 'mazorca'), i('Cebolla', 'cebolla'), i('Cilantro', 'cilantro'), i('Arroz', 'arroz')] },
  { id: 'sancocho-pescado', tipo: 'Sopas', emoji: '🍜', nombre: 'Sancocho de pescado', descripcion: 'Sancocho de pescado con yuca, ñame y plátano. Un clásico del Caribe.',
    ingredientes: [i('Pescado', 'pescado'), i('Yuca', 'yuca'), i('Ñame', 'name'), i('Plátano', 'platano'), i('Cebolla', 'cebolla'), i('Cilantro', 'cilantro'), i('Limón', 'limon')] },
  { id: 'ajiaco', tipo: 'Sopas', emoji: '🥣', nombre: 'Ajiaco con pollo', descripcion: 'Sopa cremosa de tres papas con pollo, mazorca y guascas. Se sirve con arroz y aguacate.',
    ingredientes: [i('Pollo', 'pollo'), i('Papa', 'papa'), i('Papa criolla', 'criolla'), i('Mazorca', 'mazorca'), i('Guascas', 'guascas'), i('Arroz', 'arroz'), i('Aguacate', 'aguacate')] },
  { id: 'sopa-pasta', tipo: 'Sopas', emoji: '🍜', nombre: 'Sopa de pasta con pollo', descripcion: 'Sopa caliente de pasta con pollo y verduras. Perfecta para un día fresco.',
    ingredientes: [i('Pasta para sopa', 'pasta'), i('Pollo', 'pollo'), i('Zanahoria', 'zanahoria'), i('Papa', 'papa'), i('Cebolla', 'cebolla'), i('Cilantro', 'cilantro')] },
  { id: 'sopa-verduras', tipo: 'Sopas', emoji: '🥕', nombre: 'Sopa de verduras', descripcion: 'Sopa liviana de zanahoria, papa, habichuela y arveja. Saludable y barata.',
    ingredientes: [i('Zanahoria', 'zanahoria'), i('Papa', 'papa'), i('Habichuela', 'habichuela'), i('Arveja', 'arveja'), i('Cebolla', 'cebolla'), i('Cilantro', 'cilantro'), i('Sal', 'sal')] },
  { id: 'lentejas', tipo: 'Granos', emoji: '🫘', nombre: 'Lentejas con arroz y huevo', descripcion: 'Lentejas guisadas con cebolla y tomate, arroz blanco y huevo frito. Rendidor y nutritivo.',
    ingredientes: [i('Lentejas', 'lenteja'), i('Arroz', 'arroz'), i('Huevos', 'huevo'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Ajo', 'ajo'), i('Aceite', 'aceite')] },
  { id: 'frijoles', tipo: 'Granos', emoji: '🫘', nombre: 'Fríjoles con arroz y plátano', descripcion: 'Fríjoles cargamanto con arroz, plátano maduro frito y aguacate.',
    ingredientes: [i('Fríjol', 'frijol'), i('Arroz', 'arroz'), i('Plátano maduro', 'platano'), i('Aguacate', 'aguacate'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate')] },
  { id: 'garbanzos', tipo: 'Granos', emoji: '🍲', nombre: 'Garbanzos guisados con arroz', descripcion: 'Garbanzos con zanahoria y papa en guiso suave. Sin carne, lleno de sabor.',
    ingredientes: [i('Garbanzo', 'garbanzo'), i('Arroz', 'arroz'), i('Zanahoria', 'zanahoria'), i('Papa', 'papa'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate')] },
  { id: 'arroz-huevo', tipo: 'Huevo', emoji: '🍳', nombre: 'Arroz con huevo y plátano maduro', descripcion: 'El almuerzo rápido de siempre: arroz, huevo frito, plátano maduro y ensalada.',
    ingredientes: [i('Arroz', 'arroz'), i('Huevos', 'huevo'), i('Plátano maduro', 'platano'), i('Tomate', 'tomate'), i('Cebolla', 'cebolla'), i('Aceite', 'aceite')] },
  { id: 'huevos-pericos', tipo: 'Huevo', emoji: '🍳', nombre: 'Huevos pericos con arepa', descripcion: 'Huevos revueltos con cebolla y tomate, con arepa de maíz y chocolate caliente.',
    ingredientes: [i('Huevos', 'huevo'), i('Arepa', 'arepa'), i('Cebolla', 'cebolla'), i('Tomate', 'tomate'), i('Chocolate', 'chocolate'), i('Queso', 'queso'), i('Aceite', 'aceite')] },
  { id: 'pasta-bolonesa', tipo: 'Pasta', emoji: '🍝', nombre: 'Pasta a la boloñesa', descripcion: 'Espagueti con salsa de carne molida, tomate y cebolla, con queso rallado.',
    ingredientes: [i('Espagueti', 'espagueti'), i('Carne molida', 'molida'), i('Salsa o pasta de tomate', 'tomate'), i('Cebolla', 'cebolla'), i('Ajo', 'ajo'), i('Queso', 'queso')] },
  { id: 'pasta-atun', tipo: 'Pasta', emoji: '🍝', nombre: 'Espagueti con atún', descripcion: 'Pasta con atún, tomate y cebolla en cinco minutos de preparación. Ideal entre semana.',
    ingredientes: [i('Espagueti', 'espagueti'), i('Atún', 'atun'), i('Tomate', 'tomate'), i('Cebolla', 'cebolla'), i('Ajo', 'ajo'), i('Aceite', 'aceite')] },
  { id: 'hamburguesa', tipo: 'Rápidos', emoji: '🍔', nombre: 'Hamburguesa casera con papas', descripcion: 'Hamburguesa de carne molida con queso, lechuga y tomate, y papas fritas.',
    ingredientes: [i('Carne molida', 'molida'), i('Pan de hamburguesa', 'pan'), i('Queso', 'queso'), i('Lechuga', 'lechuga'), i('Tomate', 'tomate'), i('Papa', 'papa'), i('Aceite', 'aceite')] },
]

export const menuPorId = (id) => MENUS.find(m => m.id === id) ?? null
