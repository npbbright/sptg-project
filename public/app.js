async function loadLayout() {
const response =
    await fetch("/layout");

const html =
    await response.text();

document
    .getElementById("layout")
    .innerHTML = html;

const username =
    localStorage.getItem("username")
    || "Guest";

document
    .getElementById("username")
    .innerText =
    username;

const initials =
    username
        .substring(0,2)
        .toUpperCase();

const avatar =
    document.querySelector(
        ".user-avatar"
    );

if(avatar){
    avatar.innerText =
        initials;
}

if(username === "admin"){
    document
        .querySelectorAll(".admin-link")
        .forEach(link => {
            link.style.display =
            "block";
        });
}

}

async function logout(){

localStorage.clear();

await fetch(
    "/api/logout",
    {
        method:"POST"
    }
);

window.location.href = "/";

}

loadLayout();
