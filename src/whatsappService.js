const axios = require('axios');
const googleSheetsService = require('./googleSheetsService');

// States
const STATE_INIT = 'INIT';
const STATE_SELECT_INTEREST = 'SELECT_INTEREST';
const STATE_ASK_PROCESS_CONFIRM = 'ASK_PROCESS_CONFIRM';
const STATE_FAQ_CONFIRM = 'FAQ_CONFIRM';
const STATE_ROUTE_5_SELECT = 'ROUTE_5_SELECT';
const STATE_OPERATOR_CONTACT_INFO = 'OPERATOR_CONTACT_INFO';
const STATE_ASK_TICKET_COUNT = 'ASK_TICKET_COUNT';
const STATE_TICKET_COUNT_CONFIRM = 'TICKET_COUNT_CONFIRM';
const STATE_WAIT_PAYMENT_PROOF = 'WAIT_PAYMENT_PROOF';
const STATE_PATIENT_CONTACT_INFO = 'PATIENT_CONTACT_INFO';
const STATE_PATIENT_EVENT_CONFIRM = 'PATIENT_EVENT_CONFIRM';
const STATE_COMPANY_CONTACT_INFO = 'COMPANY_CONTACT_INFO';
const STATE_COMPLETED = 'COMPLETED';
const PRECIO_BOLETO = 599;


// Option Names Mapping
const OPTIONS_MAP = {
    '1': 'Entradas con descuento (Six Flags)',
    '2': 'Festival Versus Epilepsia',
    '3': 'Contacto con la Fundación (Paciente)',
    '4': 'Empresa / Patrocinador',
    '5': 'Ya tengo comprobante de pago'
};

// URL Placeholders
const URL_LANDING_PAGE = 'https://versusepilepsia.org/';
const URL_VERSUS_EPILEPSIA = 'https://versusepilepsia.org';
const URL_STRIPE_PAYMENT = 'https://buy.stripe.com/bJe3cu9nY0yk241dOl67S0c';
const URL_FORM = 'https://forms.gle/PEgJQvuvBJj6oAN9A';

const processMessage = async (message, contact) => {
    // Check if service is active
    const serviceActive = process.env.SERVICE_ACTIVE === 'true';
    if (!serviceActive) {
        console.log('Service is inactive. Ignoring message.');
        return;
    }
    const from = message.from; // Phone number

    // Extraer texto o ID de respuesta interactiva o metadatos de archivos
    let text = '';
    let interactiveId = null;
    let mediaId = null;

    if (message.type === 'text' && message.text) {
        text = message.text.body;
    } else if (message.type === 'interactive' && message.interactive) {
        if (message.interactive.button_reply) {
            text = message.interactive.button_reply.title;
            interactiveId = message.interactive.button_reply.id;
        } else if (message.interactive.list_reply) {
            text = message.interactive.list_reply.title;
            interactiveId = message.interactive.list_reply.id;
        }
    } else if (message.type === 'image' && message.image) {
        mediaId = message.image.id;
        text = `[Imagen/Comprobante ID: ${mediaId}]`;
    } else if (message.type === 'document' && message.document) {
        mediaId = message.document.id;
        text = `[Documento/Comprobante ID: ${mediaId}]`;
    } else if (message.text) {
        text = message.text.body;
    }

    const name = contact.profile.name;

    // 1. Get current session from Google Sheets
    let session = await googleSheetsService.getSession(from);

    // 2. Palabras clave de reinicio — siempre muestran el menú principal
    const resetKeywords = /^(hola|hola!|hi|inicio|menu|menú|start|reiniciar|comenzar|empezar|reset)$/i;
    const isReset = message.type === 'text' && resetKeywords.test(text.trim());

    if (!session) {
        // New session: show main menu immediately and save state as SELECT_INTEREST
        await showMainMenu(from, name);
        await googleSheetsService.createSession(from, name, STATE_SELECT_INTEREST);
        return;
    } else if (isReset) {
        // Reset keyword: reset session, show main menu and save state as SELECT_INTEREST
        await googleSheetsService.resetSession(from);
        await showMainMenu(from, name);
        await googleSheetsService.createSession(from, name, STATE_SELECT_INTEREST);
        return;
    }

    // 3. State Machine
    switch (session.state) {
        case STATE_INIT: {
            await showMainMenu(from, name);
            await googleSheetsService.updateSession(from, { state: STATE_SELECT_INTEREST });
            break;
        }

        case STATE_SELECT_INTEREST: {
            // Resolver opción — primero por ID de lista interactiva, luego por texto
            let option = '';
            if (interactiveId) {
                // Respuesta del menú desplegable
                const idMap = {
                    'OPT_1': '1', 'OPT_2': '2', 'OPT_3': '3',
                    'OPT_4': '4', 'OPT_5': '5'
                };
                option = idMap[interactiveId] || '';
            } else {
                // Fallback: el usuario escribió un número
                const normalizedText = text.trim();
                if (/^1/.test(normalizedText)) option = '1';
                else if (/^2/.test(normalizedText)) option = '2';
                else if (/^3/.test(normalizedText)) option = '3';
                else if (/^4/.test(normalizedText)) option = '4';
                else if (/^5/.test(normalizedText)) option = '5';
            }

            if (!option) {
                await sendWhatsAppMessage(from,
                    '⚠️ Por favor usa el menú desplegable para seleccionar una opción, o escribe el número (1 al 5).');
                return;
            }

            const optionName = OPTIONS_MAP[option];
            await googleSheetsService.updateSession(from, { option: optionName });

            // Navegar según opción
            if (option === '1') {
                const infoText =
                    `¡Excelente! Aprovecha el -40%OFF de descuento en tu entrada a Six Flags, comprando con nosotros a través de Versus Epilepsia. Conoce las características del boleto:\n\n` +
                    `• El precio con nosotros por boleto es de *$599* (Precio Normal $999).\n` +
                    `• El boleto es de *Admisión General*, podrás disfrutar del parque y sólo si lo deseas acompañarnos en nuestro Festival Versus Epilepsia (8 y 9 de agosto de 2026).\n` +
                    `• La vigencia del boleto es del *8 de agosto al 8 de octubre de 2026*.\n` +
                    `• El boleto es digital, se te envía una vez realizada la compra.\n` +
                    `• La compra es segura, transferencia bancaria a través de Stripe.\n` +
                    `• Puedes disfrutar del precio especial a partir de la compra de un boleto.\n` +
                    `• Iniciamos preventa con 200 unidades y hasta agotar existencias.\n` +
                    `• El boleto es válido para niño y/o adulto.\n` +
                    `• Una vez realizada la compra no hay devoluciones.\n\n` +
                    `Conoce más sobre Superhéroes Versus Epilepsia en ${URL_LANDING_PAGE}`;

                await sendWhatsAppMessage(from, infoText);
                await sendInteractiveButtons(from, `¿Deseas conocer el proceso para adquirir tus boletos?`, [
                    { id: 'btn_yes', title: 'Sí' },
                    { id: 'btn_no', title: 'No' },
                    { id: 'btn_faq', title: 'Tengo dudas' }
                ]);
                await googleSheetsService.updateSession(from, { state: STATE_ASK_PROCESS_CONFIRM });
            } else if (option === '2') {
                const infoText =
                    `¡Excelente! Acompáñanos al Festival Superhéroes Versus Epilepsia en Six Flags 2026. Un espacio para conocer más sobre la epilepsia y su tratamiento, especialmente de la neurocirugía. Participa de nuestras actividades lúdicas, concursos, foro de especialistas, inauguración con nuestro embajador el actor, escritor y conferencista ¡Odin Dupeyron! Adicional, entra al parque con un -40% OFF. Conoce las características de la entrada:\n\n` +
                    `• El festival se llevará a cabo en Six Flags, los días *sábado 8 y domingo 9 de agosto*.\n` +
                    `• El precio del boleto por persona es de *$599* (Precio Normal $999).\n` +
                    `• Tu boleto es personal y válido sólo para una de las dos fechas.\n` +
                    `• Incluye acceso general al parque para disfrutar de los juegos.\n` +
                    `• El boleto es digital, se te envía una vez realizada la compra.\n` +
                    `• La compra es segura, pago a través de Stripe.\n` +
                    `• Iniciamos preventa con 200 unidades y hasta agotar existencias.\n` +
                    `• El boleto es válido para niño y/o adulto.\n` +
                    `• Una vez realizada la compra no hay devoluciones.\n` +
                    `• En caso de que no hayas podido acompañarnos en las fechas del festival, podrás usar tu boleto para entrar a Six Flags del 8 de agosto al 8 de octubre de 2026.\n\n` +
                    `Conoce más sobre Superhéroes Versus Epilepsia en ${URL_LANDING_PAGE}`;

                await sendWhatsAppMessage(from, infoText);
                await sendInteractiveButtons(from, `¿Deseas conocer el proceso para adquirir tus boletos?`, [
                    { id: 'btn_yes', title: 'Sí' },
                    { id: 'btn_no', title: 'No' },
                    { id: 'btn_faq', title: 'Tengo dudas' }
                ]);
                await googleSheetsService.updateSession(from, { state: STATE_ASK_PROCESS_CONFIRM });
            } else if (option === '3') {
                await sendWhatsAppMessage(from,
                    `🏥 *Contacto con la Fundación*\n\nGracias por contactarnos. \nEscribe tu nombre, \nnombre del paciente, \nciudad de residencia y \nteléfono por el cual deseas te contactemos, \n(separado por comas).`);
                await googleSheetsService.updateSession(from, { state: STATE_PATIENT_CONTACT_INFO });
            } else if (option === '4') {
                const promptText =
                    `🤝 *Contacto para Empresas*\n\n` +
                    `¡Con gusto! Escribe tu nombre, \nnombre de tu empresa, \nnúmero telefónico y \ncorreo por el cual deseas te contactemos.\n\n` +
                    `*Ejemplo:* Daniel Reyes, Analisis Clínicos B&B, 5567635436, analisis@correo.com`;
                await sendWhatsAppMessage(from, promptText);
                await googleSheetsService.updateSession(from, { state: STATE_COMPANY_CONTACT_INFO });
            } else if (option === '5') {
                await sendWhatsAppMessage(from,
                    `✅ *Comprobante de pago*\n\n¡Excelente! Por favor envía tu comprobante de pago en este chat (foto o captura de pantalla legible).`);
                await googleSheetsService.updateSession(from, { state: STATE_WAIT_PAYMENT_PROOF });
            }
            break;
        }

        case STATE_ASK_PROCESS_CONFIRM: {
            const normalizedText = text.trim().toLowerCase();
            const isYes = interactiveId === 'btn_yes' || normalizedText === 'sí' || normalizedText === 'si';
            const isNo = interactiveId === 'btn_no' || normalizedText === 'no';
            const isFaq = interactiveId === 'btn_faq' || /duda|faq|pregunta/i.test(normalizedText);

            if (isYes) {
                const processText =
                    `¡Excelente! El proceso es seguro y muy sencillo 🌟\n\n` +
                    `• Indica cuántos boletos deseas comprar.\n` +
                    `• Te enviaremos el total a pagar.\n` +
                    `• Realizas el pago a través de la liga que te enviaremos (Stripe).\n` +
                    `• Envías tu comprobante por este mismo chat.\n` +
                    `• Llenas el formulario que te enviaremos para asegurar tu registro.\n` +
                    `• Validamos tu pago y enviamos tus boletos.\n\n` +
                    `Para iniciar ¿cuántos boletos deseas comprar? 🎟️`;

                await sendWhatsAppMessage(from, processText);
                await googleSheetsService.updateSession(from, { state: STATE_ASK_TICKET_COUNT });
            } else if (isNo) {
                const route5Text = `Selecciona la opción que te permita continuar:`;
                await sendInteractiveButtons(from, route5Text, [
                    { id: 'opt_operator', title: 'Hablar con operador' },
                    { id: 'opt_later', title: 'Comprar más adelante' }
                ]);
                await googleSheetsService.updateSession(from, { state: STATE_ROUTE_5_SELECT });
            } else if (isFaq) {
                const faqText =
                    `Te mostramos las preguntas más frecuentes:\n\n` +
                    `• *¿Puedo conocer el programa o actividades?*\n` +
                    `Sí, entra a ${URL_LANDING_PAGE}\n\n` +
                    `• *¿Si no tengo tarjeta hay otro método de pago?*\n` +
                    `Sí es posible. Envíe Whatsapp al *5586214843* para recibir proceso de pago.\n\n` +
                    `• *¿Hay descuento o accesos gratis si soy persona con epilepsia?*\n` +
                    `Sí, tenemos un número limitado y sujeto a disponibilidad. Envíe Whatsapp al *5586214843* para más información.\n\n` +
                    `• *¿Hay límite de boletos?*\n` +
                    `Puedes comprar a partir de un boleto. Iniciamos preventa con 200 boletos. Si deseas realizar una compra mayor a 20 boletos, envíe Whatsapp al *5586214843*, para conocer nuestros paquetes para grupos o empresas.\n\n` +
                    `• *¿Puedo comprar entradas el día del evento?*\n` +
                    `Sujeto a disponibilidad. En caso de haberse agotado existencias, podrás comprar tu entrada en la taquilla de Six Flags a precio normal.\n\n` +
                    `• *¿Puedo comprar boletos para otras personas?*\n` +
                    `Sí, puedes adquirir los boletos que necesites para tus amigos o familiares. El boleto es de un sólo uso. Una vez enviado el boleto digital, su resguardo y uso quedan bajo responsabilidad del comprador. La organización no se hace responsable si el boleto digital es compartido y utilizado por otra persona. Si deseas realizar una compra mayor a 20 boletos, envíe Whatsapp al *5586214843*.\n\n` +
                    `• *¿Cuánto tiempo tarda la validación de mi pago, para recibir mis boletos?*\n` +
                    `Entre uno y tres días hábiles. Si por algún motivo no has recibido los boletos en este periodo, envíanos tu nombre y comprobante de pago por Whatsapp al *5586214843*.\n\n` +
                    `• *¿Puedo asistir si sólo tengo el comprobante de pago?*\n` +
                    `No. El boleto digital es tu entrada.\n\n` +
                    `• *¿Qué hago si pagué, pero no recibí mis boletos?*\n` +
                    `Si no has recibido tus boletos en tres días hábiles, envíanos tu nombre y comprobante de pago por Whatsapp al *5586214843*.\n\n` +
                    `¿Estás listo para continuar con el proceso?`;

                await sendInteractiveButtons(from, faqText, [
                    { id: 'btn_faq_yes', title: 'Sí' },
                    { id: 'btn_faq_no', title: 'No' }
                ]);
                await googleSheetsService.updateSession(from, { state: STATE_FAQ_CONFIRM });
            } else {
                await sendWhatsAppMessage(from, '⚠️ Por favor responde usando los botones.');
            }
            break;
        }

        case STATE_FAQ_CONFIRM: {
            const normalizedText = text.trim().toLowerCase();
            const isYes = interactiveId === 'btn_faq_yes' || normalizedText === 'sí' || normalizedText === 'si';
            const isNo = interactiveId === 'btn_faq_no' || normalizedText === 'no';

            if (isYes) {
                await sendWhatsAppMessage(from, 'Para iniciar ¿cuántos boletos deseas comprar? 🎟️');
                await googleSheetsService.updateSession(from, { state: STATE_ASK_TICKET_COUNT });
            } else if (isNo) {
                const route5Text = `Selecciona la opción que te permita continuar:`;
                await sendInteractiveButtons(from, route5Text, [
                    { id: 'opt_operator', title: 'Hablar con operador' },
                    { id: 'opt_later', title: 'Comprar más adelante' }
                ]);
                await googleSheetsService.updateSession(from, { state: STATE_ROUTE_5_SELECT });
            } else {
                await sendWhatsAppMessage(from, '⚠️ Por favor responde usando los botones.');
            }
            break;
        }

        case STATE_ROUTE_5_SELECT: {
            const isOperator = interactiveId === 'opt_operator' || /^1/.test(text.trim());
            const isLater = interactiveId === 'opt_later' || /^2/.test(text.trim());

            if (isOperator) {
                await sendWhatsAppMessage(from, '¡Con gusto! Escribe tu nombre y número telefónico. Nos pondremos en contacto contigo por mensaje directo desde el Whatsapp de Versus Epilepsia (5586214843).');
                await googleSheetsService.updateSession(from, { state: STATE_OPERATOR_CONTACT_INFO });
            } else if (isLater) {
                await sendWhatsAppMessage(from,
                    `¡Con gusto! Te esperamos pronto ¡No te quedes sin tus boletos a precio especial!\n\n` +
                    `Conoce más de Versus Epilepsia en ${URL_VERSUS_EPILEPSIA}\n\n` +
                    `Conoce más de Superhéroes Versus Epilepsia en ${URL_LANDING_PAGE}.`);

                await googleSheetsService.archiveSession(from);
            } else {
                await sendWhatsAppMessage(from, '⚠️ Por favor selecciona una opción utilizando los botones.');
            }
            break;
        }

        case STATE_OPERATOR_CONTACT_INFO: {
            await sendWhatsAppMessage(from, 'Tenemos tus datos, nos pondremos en contacto. \nSaludos.');
            await googleSheetsService.archiveSession(from, { detail: text });
            break;
        }

        case STATE_ASK_TICKET_COUNT: {
            const normalizedText = text.trim();
            const countMatch = normalizedText.match(/\d+/);
            let count = countMatch ? parseInt(countMatch[0], 10) : NaN;

            if (isNaN(count) || count <= 0) {
                const numWords = {
                    'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4,
                    'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10
                };
                const cleanWord = normalizedText.toLowerCase();
                if (numWords[cleanWord]) {
                    count = numWords[cleanWord];
                }
            }

            if (isNaN(count) || count <= 0) {
                await sendWhatsAppMessage(from, '⚠️ Por favor ingresa una cantidad de boletos válida (por ejemplo: 2).');
                return;
            }

            const total = count * PRECIO_BOLETO;
            await googleSheetsService.updateSession(from, {
                detail: `Cantidad: ${count}, Total: $${total}`,
                state: STATE_TICKET_COUNT_CONFIRM
            });

            await sendInteractiveButtons(from, `¡Perfecto, ${count} boletos! Sería un total de $${total}. Para continuar, por favor confirma con la palabra CORRECTO.`, [
                { id: 'btn_confirm_qty', title: 'CORRECTO' }
            ]);
            break;
        }

        case STATE_TICKET_COUNT_CONFIRM: {
            const normalizedText = text.trim().toLowerCase();
            const isCorrect = interactiveId === 'btn_confirm_qty' || normalizedText === 'correcto';

            if (isCorrect) {
                const paymentMsg =
                    `Para procesar tu compra de forma 100% segura, da clic en el siguiente enlace de pago por Stripe y manda tu comprobante de pago en este chat (foto o captura de pantalla legible). Una vez realizado tu pago, adjunta tu comprobante aquí.\n\n` +
                    `💳 *[Pagar ahora en línea - Enlace Seguro]*\n` +
                    `${URL_STRIPE_PAYMENT}`;

                await sendWhatsAppMessage(from, paymentMsg);
                await googleSheetsService.updateSession(from, { state: STATE_WAIT_PAYMENT_PROOF });
            } else {
                await sendWhatsAppMessage(from, '⚠️ Por favor confirma la cantidad de boletos presionando el botón "CORRECTO" o escribiendo la palabra CORRECTO.');
            }
            break;
        }

        case STATE_WAIT_PAYMENT_PROOF: {
            await sendWhatsAppMessage(from, `Llena el siguiente formulario que te tomará 2 minutos 🚀\n\n📝 *[Enlace formulario]*\n${URL_FORM}`);
            await sendWhatsAppMessage(from, `Una vez validada tu compra por nuestro equipo, recibirás tus boletos por mensaje directo desde el Whatsapp de Versus Epilepsia(5586214843) 🎪\n(La validación puede tardar entre 1 y 3 días hábiles) ¡Gracias por apoyar a Versus Epilepsia! \n ¡Ya eres un superhéroe VERSUS EPILEPSIA, nos vemos en SIX FLAGS! `);

            await googleSheetsService.archiveSession(from, { paymentProof: text });
            break;
        }

        case STATE_PATIENT_CONTACT_INFO: {
            await googleSheetsService.updateSession(from, {
                detail: text,
                state: STATE_PATIENT_EVENT_CONFIRM
            });

            // Guardar inmediatamente en la pestaña especial "Pacientes"
            await googleSheetsService.savePatientInfo(from, text);

            const followUpText =
                `Tenemos tus datos, nos pondremos en contacto contigo. Si deseas sacar una cita por favor llama al *5579462798*.\n\n` +
                `¿Deseas conocer sobre nuestro próximo evento Superhéroes Versus Epilepsia en Six Flags?`;

            await sendInteractiveButtons(from, followUpText, [
                { id: 'btn_event_yes', title: 'Sí' },
                { id: 'btn_event_no', title: 'No' }
            ]);
            break;
        }

        case STATE_PATIENT_EVENT_CONFIRM: {
            const normalizedText = text.trim().toLowerCase();
            const isYes = interactiveId === 'btn_event_yes' || normalizedText === 'sí' || normalizedText === 'si';
            const isNo = interactiveId === 'btn_event_no' || normalizedText === 'no';

            if (isYes) {
                const infoText =
                    `¡Excelente! Acompáñanos al Festival Superhéroes Versus Epilepsia en Six Flags 2026. Un espacio para conocer más sobre la epilepsia y su tratamiento, especialmente de la neurocirugía. Participa de nuestras actividades lúdicas, concursos, foro de especialistas, inauguración con nuestro embajador el actor, escritor y conferencista ¡Odin Dupeyron! Adicional, entra al parque con un -40% OFF. Conoce las características de la entrada:\n\n` +
                    `• El festival se llevará a cabo en Six Flags, los días *sábado 8 y domingo 9 de agosto*.\n` +
                    `• El precio del boleto por persona es de *$599* (Precio Normal $999).\n` +
                    `• Tu boleto es personal y válido sólo para una de las dos fechas.\n` +
                    `• Incluye acceso general al parque para disfrutar de los juegos.\n` +
                    `• El boleto es digital, se te envía una vez realizada la compra.\n` +
                    `• La compra es segura, pago a través de Stripe.\n` +
                    `• Iniciamos preventa con 200 unidades y hasta agotar existencias.\n` +
                    `• El boleto es válido para niño y/o adulto.\n` +
                    `• Una vez realizada la compra no hay devoluciones.\n` +
                    `• En caso de que no hayas podido acompañarnos en las fechas del festival, podrás usar tu boleto para entrar a Six Flags del 8 de agosto al 8 de octubre de 2026.\n\n` +
                    `Conoce más sobre Superhéroes Versus Epilepsia en ${URL_LANDING_PAGE}`;

                await sendWhatsAppMessage(from, infoText);
                await sendInteractiveButtons(from, `¿Deseas conocer el proceso para adquirir tus boletos?`, [
                    { id: 'btn_yes', title: 'Sí' },
                    { id: 'btn_no', title: 'No' },
                    { id: 'btn_faq', title: 'Tengo dudas' }
                ]);

                await googleSheetsService.updateSession(from, {
                    option: OPTIONS_MAP['2'],
                    state: STATE_ASK_PROCESS_CONFIRM
                });
            } else if (isNo) {
                await sendWhatsAppMessage(from, 'Tenemos tus datos, nos pondremos en contacto contigopronto. \nSaludos.');
                await googleSheetsService.resetSession(from);
            } else {
                await sendWhatsAppMessage(from, '⚠️ Por favor responde usando los botones.');
            }
            break;
        }

        case STATE_COMPANY_CONTACT_INFO: {
            const linkMsg =
                `Tenemos tus datos, nos pondremos en contacto contigo pronto.\n\n` +
                `Conoce más de Versus Epilepsia en ${URL_VERSUS_EPILEPSIA}\n\n` +
                `Conoce más de Superhéroes Versus Epilepsia en ${URL_LANDING_PAGE}.`;

            await sendWhatsAppMessage(from, linkMsg);
            await googleSheetsService.archiveSponsorSession(from, text);
            break;
        }

        case STATE_COMPLETED: {
            await googleSheetsService.resetSession(from);
            break;
        }

        default:
            await googleSheetsService.resetSession(from);
            await googleSheetsService.createSession(from, name);
            await showMainMenu(from, name);
            await googleSheetsService.updateSession(from, { state: STATE_SELECT_INTEREST });
            break;
    }
};

// Función reutilizable para mostrar el menú principal
async function showMainMenu(from, name) {
    const welcomeHeader = `¡Hola, ${name}! 👋`;
    const welcomeBody =
        `Gracias por tu interés por ser parte de nuestro evento en *Six Flags 2026* 🎢\n\n` +
        `Elige la opción del menú que mejor te describa:`;

    await sendInteractiveList(
        from,
        welcomeBody,
        [
            {
                id: 'OPT_1',
                title: '🎟️ Entradas Six Flags',
                description: 'Entradas con descuento para el evento'
            },
            {
                id: 'OPT_2',
                title: '🎪 Festival Epilepsia',
                description: 'Conoce el Festival Versus Epilepsia'
            },
            {
                id: 'OPT_3',
                title: '🏥 Apoyo a paciente',
                description: 'Contacto con la Fundación para pacientes'
            },
            {
                id: 'OPT_4',
                title: '🤝 Ser patrocinador',
                description: 'Paquetes y patrocinio para empresas'
            },
            {
                id: 'OPT_5',
                title: '✅ Ya tengo pago',
                description: 'Envía tu comprobante de pago realizado'
            }
        ],
        'Ver opciones',
        '¿Qué te interesa?',
        welcomeHeader
    );
}

const sendWhatsAppMessage = async (to, body) => {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.PhoneNumberID;

    if (!token || !phoneNumberId) {
        console.error("Missing WhatsApp credentials");
        return;
    }

    let cleanNumber = to;
    if (to.startsWith('521')) {
        cleanNumber = '52' + to.substring(3);
    }

    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: cleanNumber,
                type: 'text',
                text: { body: body },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (error) {
        console.error('Error sending WhatsApp message:', error.response ? error.response.data : error.message);
    }
};

const sendInteractiveButtons = async (to, bodyText, buttons) => {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.PhoneNumberID;

    let cleanNumber = to;
    if (to.startsWith('521')) {
        cleanNumber = '52' + to.substring(3);
    }

    const buttonRows = buttons.map(b => ({
        type: "reply",
        reply: {
            id: b.id,
            title: b.title
        }
    }));

    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                to: cleanNumber,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        text: bodyText
                    },
                    action: {
                        buttons: buttonRows
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (error) {
        console.error('Error sending interactive message:', error.response ? error.response.data : error.message);
    }
};

async function sendInteractiveList(to, bodyText, items, buttonText = 'Seleccionar', sectionTitle = 'Opciones', headerText = null) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.PhoneNumberID;

    const sections = [{
        title: sectionTitle,
        rows: items.map(item => ({
            id: item.id,
            title: item.title,
            description: item.description || ''
        }))
    }];

    let cleanNumber = to;
    if (to.startsWith('521')) {
        cleanNumber = '52' + to.substring(3);
    }

    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: cleanNumber,
                type: 'interactive',
                interactive: {
                    type: 'list',
                    ...(headerText && {
                        header: { type: 'text', text: headerText }
                    }),
                    body: { text: bodyText },
                    action: {
                        button: buttonText,
                        sections: sections
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error('Error sending interactive list:', error.response ? error.response.data : error.message);
    }
}

module.exports = { processMessage };
