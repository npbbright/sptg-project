function toggleSidebar() {
    document.body.classList.toggle("sidebar-open");
}

function closeSidebar() {
    document.body.classList.remove("sidebar-open");
}

async function logout() {
    localStorage.clear();

    await fetch(
        "/api/logout",
        {
            method: "POST"
        }
    );

    window.location.href = "/";
}

function addLogoutButton() {
    document
        .querySelectorAll(".user-info")
        .forEach((userInfo) => {
            if (userInfo.querySelector(".logout-btn")) {
                return;
            }

            const logoutButton =
                document.createElement("button");

            logoutButton.type = "button";
            logoutButton.className = "logout-btn";
            logoutButton.innerText = "Logout";
            logoutButton.addEventListener("click", logout);

            userInfo.appendChild(logoutButton);
        });
}

function setAdminLinkVisibility() {
    const username =
        localStorage.getItem("username") || "Guest";
    const isAdmin =
        username === "admin";

    document
        .querySelectorAll(".admin-link")
        .forEach((link) => {
            link.style.display =
                isAdmin
                    ? "block"
                    : "none";
        });
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeSidebar();
    }
});

addLogoutButton();
setAdminLinkVisibility();
