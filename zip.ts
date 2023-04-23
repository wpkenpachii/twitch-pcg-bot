// const AdmZip = require("adm-zip");

// async function createZipArchive() {
//   const zip = new AdmZip();
//   const outputFile = "bot.zip";
//   zip.addFile("bot.exe");
//   zip.writeZip(outputFile);
//   console.log(`Created ${outputFile} successfully`);
// }

// createZipArchive();




const fs = require("fs");
const zip = require("node-native-zip");

const archive = new zip();

archive.addFiles([ 
    { name: "bot.exe", path: "./bot.exe" },
], function (err: any) {
    if (err) return console.log("err while adding files", err);
    const buff = archive.toBuffer();
    fs.writeFile("./bot.zip", buff, function () {
        console.log("Finished");
    });
});