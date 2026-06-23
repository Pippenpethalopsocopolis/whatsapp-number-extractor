const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const XLSX = require('xlsx');

// CHANGE THIS: Type the exact name of your WhatsApp group
const TARGET_GROUP_NAME = 'WhatsApp Group Name Goes Here';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('\n--- SCAN THE QR CODE BELOW WITH WHATSAPP ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('\nBot connected successfully! Fetching your chats...');

    try {
        const chats = await client.getChats();
        const group = chats.find(chat => chat.isGroup && chat.name === TARGET_GROUP_NAME);

        if (!group) {
            console.error(`\nError: Could not find a group named "${TARGET_GROUP_NAME}".`);
            process.exit(1);
        }

        console.log(`\nFound group: "${group.name}"`);
        console.log(`Checking ${group.participants.length} group members against your contact list...`);

        const memberData = [];
        let processedCount = 0;

        // Loop through each participant sequentially to fetch contact status
        for (const member of group.participants) {
            processedCount++;
            
            // Console progress tracker so you know the bot hasn't frozen
            if (processedCount % 25 === 0 || processedCount === group.participants.length) {
                console.log(`Scanned ${processedCount}/${group.participants.length} members...`);
            }

            try {
                // Query local WhatsApp Web cache for full contact details
                const contact = await client.getContactById(member.id._serialized);
                
                // THE FILTER: Skip if the contact is saved in your phonebook OR if it's your own number
                if (contact.isMyContact || contact.isMe) {
                    continue; 
                }

                memberData.push({
                    'Phone Number': `+${contact.number || member.id.user}`,
                    'WhatsApp Public Profile Name': contact.pushname || 'No Public Name',
                    'Is Admin': member.isAdmin ? 'Yes' : 'No',
                    'Role': member.isSuperAdmin ? 'Group Creator' : (member.isAdmin ? 'Admin' : 'Member')
                });
            } catch (err) {
                // Silently bypass any corrupted entries or strict privacy-restricted accounts
            }
        }

        // Break early if everyone in the group is already a contact
        if (memberData.length === 0) {
            console.log('\nNo unsaved numbers found! Everyone in this group is already in your phonebook.');
            process.exit(0);
        }

        // Build Excel spreadsheet
        const worksheet = XLSX.utils.json_to_sheet(memberData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Unsaved Contacts');

        worksheet['!cols'] = [
            { wch: 22 }, // Phone Number
            { wch: 28 }, // Public Profile Name
            { wch: 12 }, // Is Admin
            { wch: 18 }  // Role
        ];

        const safeFileName = `${TARGET_GROUP_NAME.replace(/[^a-z0-9]/gi, '_')}_unsaved_members.xlsx`;
        XLSX.writeFile(workbook, safeFileName);

        console.log(`\nSuccess! Saved ${memberData.length} UNKNOWN/UNSAVED numbers to "${safeFileName}"\n`);
        process.exit(0);

    } catch (error) {
        console.error('\nAn unexpected error occurred:', error);
        process.exit(1);
    }
});

client.initialize();